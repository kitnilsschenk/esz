import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import type { SecurityContext } from '../../common/security/security-context';
import { EnergyEndkundeRepository } from '../persistence/energy/energy-endkunde.repository';
import type { Endkunde } from '../persistence/energy/energy-endkunde.repository';
import { EnergyZaehlerRepository } from '../persistence/energy/energy-zaehler.repository';
import { IdentityEndkundePiiRepository } from '../persistence/identity/identity-endkunde-pii.repository';
import { IdentitySubjektSchluesselRepository } from '../persistence/identity/identity-subjekt-schluessel.repository';
import { IdentityStandortPiiRepository } from '../persistence/identity/identity-standort-pii.repository';
import { DeviceGeraetZuordnungRepository } from '../persistence/device/device-geraet-zuordnung.repository';
import { NachweisBestandRepository } from '../persistence/nachweis-bestand.repository';
import { KEY_MANAGEMENT_PORT } from '../../common/crypto/key-management.port';
import type { KeyManagementPort } from '../../common/crypto/key-management.port';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import { KryptoShreddingService } from '../crypto/krypto-shredding.service';
import { DeviceKryptoShreddingService } from '../crypto/device-krypto-shredding.service';
import { PiiProjektionsPolicy } from '../pii/pii-projektions.policy';
import { paginate } from '../persistence/cursor.util';
import { toSeite } from '../common/seite.dto';
import type { Seite } from '../common/seite.dto';
import type { EinschraenkungGrundCode } from '../../nachweis/domain/paar-einschraenkung';
import { konflikt, nichtGefunden, ungueltigeEingabe } from '../common/problem.util';
import {
  entscheideAufhebung,
  entscheideSperre,
  fehlenderUnterrichtungsNachweis,
  pruefeNeuerhebungsEntscheidung,
} from '../common/sperr-entscheidung.util';
import { AuditService } from '../../audit/audit.service';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { EnergyEinschraenkungUnterrichtungRepository } from '../persistence/energy/energy-einschraenkung-unterrichtung.repository';
import type { UnterrichtungKanal } from '../persistence/energy/energy-einschraenkung-unterrichtung.repository';
import { mapEndkundeDetail, mapEndkundeListItem } from './endkunde.mapper';
import type { EndkundeDetail, EndkundeListItem, EndkundePiiResponse, ShreddingErgebnis } from './endkunde.types';
import type { EndkundeAnlegenDto } from './dto/endkunde-anlegen.dto';
import type { EndkundeAendernDto } from './dto/endkunde-aendern.dto';

const FELD_NAME = 'name';
const FELD_ANSCHRIFT = 'anschrift';
const FELD_KONTAKT = 'kontakt';

interface AnlegenTxInput {
  readonly endkundeId: string;
  readonly subjektSchluesselId: string;
  readonly wrappedDek: Buffer;
  readonly kmsKeyId: string;
  readonly algVersion: number;
  readonly nameEnc: Buffer;
  readonly anschriftEnc: Buffer;
  readonly kontaktEnc: Buffer | null;
  readonly vonWissAuswertungAusgenommen: boolean;
  readonly endkundengruppe: string | null;
}

/**
 * ADR-0008 §20 (D8) — Fach-Service (Controller dünn, Business-Logik hier).
 * Endkunde-Create ist die kanonische "NESTED-Tx über identity+energy"
 * (ADR-0008 §20/§17): (1) DEK generieren (`KeyManagementPort`, VOR dem
 * inneren NESTED-Tx-Beginn — NICHT vor der äußeren Request-Tx, die bereits
 * offen ist, s. Kommentar in `anlegen()` zum tatsächlichen Stand des
 * §19-Constraints/ADR-0008 §29(C)), (2) PII feldverschlüsseln, (3)
 * `identity.subjekt_schluessel` + `identity.endkunde_pii` +
 * `energy.endkunde` in EINER `@Transactional(Propagation.Nested)`-Klammer
 * (atomar oder gar nicht).
 */
const DE04_UEBER_WIDERSPRUCH =
  'Die Ausnahme von der wissenschaftlichen Auswertung (DE-04) kann ueber die Stammdaten nicht mehr ' +
  'gesetzt werden. Sie folgt seit AW-27 einer Erklaerung der betroffenen Person und wird ueber ' +
  'POST /consent/widersprueche mit zweckCode "wiss_auswertung" erfasst. Grund: Ein Haekchen hat keine ' +
  'Geschichte — wer wann auf welchem Weg widersprochen hat, ist fuer eine Auskunft nach Art. 15 und ' +
  'fuer die Rechenschaft nach Art. 5 Abs. 2 genau die Frage.';

@Injectable()
export class EndkundeService {
  constructor(
    private readonly endkundeRepository: EnergyEndkundeRepository,
    private readonly endkundePiiRepository: IdentityEndkundePiiRepository,
    private readonly subjektSchluesselRepository: IdentitySubjektSchluesselRepository,
    @Inject(KEY_MANAGEMENT_PORT) private readonly keyManagementPort: KeyManagementPort,
    private readonly fieldCipher: FieldCipherService,
    private readonly kryptoShreddingService: KryptoShreddingService,
    private readonly piiProjektionsPolicy: PiiProjektionsPolicy,
    // ADR-0005 §26.5 — Geraete-Zuordnungs-Shred-Kopplung (device-Dimension, GB-C).
    private readonly zaehlerRepository: EnergyZaehlerRepository,
    private readonly geraetZuordnungRepository: DeviceGeraetZuordnungRepository,
    private readonly deviceKryptoShreddingService: DeviceKryptoShreddingService,
    // ADR-0010 D4 — Standort-PII-Shred-Kopplung (neue Dimension, analog GB-C).
    private readonly standortPiiRepository: IdentityStandortPiiRepository,
    // ADR-0006 P5b/A7 — Nachweis-Bestands-Ausweis für den Shred-Report.
    private readonly nachweisBestandRepository: NachweisBestandRepository,
    private readonly unterrichtungRepository: EnergyEinschraenkungUnterrichtungRepository,
    private readonly auditService: AuditService,
  ) {}

  async liste(options: { readonly cursor?: string; readonly limit: number }): Promise<Seite<EndkundeListItem>> {
    const rows = await this.endkundeRepository.listPage(options);
    const { daten, naechsterCursor } = paginate(rows, options.limit);
    return toSeite(daten.map(mapEndkundeListItem), naechsterCursor, options.limit);
  }

  async detail(id: string, subject: SecurityContext): Promise<EndkundeDetail> {
    const endkunde = await this.endkundeRepository.findById(id);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }

    const stammdatenPii = await this.resolvePiiFuerAntwort(id, subject, endkunde.verarbeitungsStatus);
    return mapEndkundeDetail(endkunde, stammdatenPii);
  }

  /**
   * KMS-Roundtrip (`generateDataKey()`) läuft bewusst HIER, VOR dem Aufruf
   * der `@Transactional(Propagation.Nested)`-Methode (`anlegenInTx`) — das
   * hält zumindest die INNERE, savepoint-basierte Nested-Tx frei von
   * KMS-I/O (`backend-lead`-Constraint, ADR-0008 §19 Review-Nachtrag).
   *
   * WICHTIG (Review-Korrektur Phase 4b, s. `KeyManagementPort`-Doc-Kommentar
   * für Details): das erfüllt den §19-Constraint "KMS-Roundtrip nie in
   * offener Tx" NUR relativ zur inneren Nested-Tx — NICHT relativ zur
   * äußeren Request-Transaktion. Der global registrierte
   * `TransactionInterceptor` öffnet für jeden Request (außer
   * `@SkipTransaction`) bereits VOR dem Controller eine `Propagation.
   * Required`-Transaktion mit sofortigem BEGIN — `generateDataKey()` läuft
   * hier also TATSÄCHLICH innerhalb einer bereits offenen (äußeren)
   * Transaktion, nur außerhalb des inneren SAVEPOINTs. Für den aktuellen,
   * synchronen `LocalDevKmsAdapter` (kein echter Netzwerk-Roundtrip) ist das
   * unkritisch. Vor Einführung eines echten Cloud-KMS-Adapters (ADR-0005)
   * ist das architektonisch zu lösen — sonst hält die äußere Request-Tx die
   * DB-Verbindung über die KMS-Netz-Latenz offen (offener Punkt: ADR-0008
   * §29(C)).
   *
   * Die Verschlüsselung selbst (`FieldCipherService`, reine CPU-Operation)
   * läuft ebenfalls hier, sodass die NESTED-Tx nur noch die reinen
   * DB-Schreibungen der bereits im Speicher liegenden Chiffrate enthält.
   */
  async anlegen(dto: EndkundeAnlegenDto, subject: SecurityContext): Promise<EndkundeDetail> {
    const generatedKey = await this.keyManagementPort.generateDataKey();
    const endkundeId = randomUUID();

    const nameEnc = this.fieldCipher.encrypt(generatedKey.dek, endkundeId, FELD_NAME, dto.stammdatenPii.name);
    const anschriftEnc = this.fieldCipher.encrypt(
      generatedKey.dek,
      endkundeId,
      FELD_ANSCHRIFT,
      dto.stammdatenPii.anschrift,
    );
    const kontaktEnc =
      dto.stammdatenPii.kontakt !== undefined
        ? this.fieldCipher.encrypt(generatedKey.dek, endkundeId, FELD_KONTAKT, dto.stammdatenPii.kontakt)
        : null;

    if (dto.vonWissAuswertungAusgenommen !== undefined) {
      throw ungueltigeEingabe(DE04_UEBER_WIDERSPRUCH);
    }

    const endkunde = await this.anlegenInTx({
      endkundeId,
      subjektSchluesselId: randomUUID(),
      wrappedDek: generatedKey.wrappedDek,
      kmsKeyId: generatedKey.kmsKeyId,
      algVersion: generatedKey.algVersion,
      nameEnc,
      anschriftEnc,
      kontaktEnc,
      // Immer `false` beim Anlegen: Ein Widerspruch, der schon bei der
      // Anlage vorliegt, wird als Erklaerung erfasst — nicht als Vorbelegung.
      vonWissAuswertungAusgenommen: false,
      endkundengruppe: dto.endkundengruppe ?? null,
    });

    // Response-PII kommt direkt aus dem gerade validierten Klartext (kein
    // erneutes Un-Wrap/Decrypt nötig) — die Policy entscheidet konsistent
    // anhand des ECHTEN aufrufenden Subjekts (nicht anders als bei
    // detail()/aendern()/sperren()), auch wenn `@Roles('betrieb')` diese
    // Route bereits vorfiltert (Defense-in-Depth, D6).
    const stammdatenPii: EndkundePiiResponse | null = this.piiProjektionsPolicy.darfPiiSehen(subject, {
      verarbeitungsStatus: endkunde.verarbeitungsStatus,
    })
      ? { name: dto.stammdatenPii.name, anschrift: dto.stammdatenPii.anschrift, kontakt: dto.stammdatenPii.kontakt ?? null }
      : null;

    return mapEndkundeDetail(endkunde, stammdatenPii);
  }

  @Transactional(Propagation.Nested)
  private async anlegenInTx(input: AnlegenTxInput): Promise<Endkunde> {
    await this.subjektSchluesselRepository.insert({
      id: input.subjektSchluesselId,
      wrappedDek: input.wrappedDek,
      kmsKeyId: input.kmsKeyId,
      algVersion: input.algVersion,
    });

    await this.endkundePiiRepository.insert({
      id: randomUUID(),
      pseudonymId: input.endkundeId,
      cryptoKeyId: input.subjektSchluesselId,
      nameEnc: input.nameEnc,
      anschriftEnc: input.anschriftEnc,
      kontaktEnc: input.kontaktEnc,
    });

    return this.endkundeRepository.insert({
      id: input.endkundeId,
      vonWissAuswertungAusgenommen: input.vonWissAuswertungAusgenommen,
      endkundengruppe: input.endkundengruppe,
    });
  }

  async aendern(id: string, dto: EndkundeAendernDto, subject: SecurityContext): Promise<EndkundeDetail> {
    if (dto.vonWissAuswertungAusgenommen !== undefined) {
      throw ungueltigeEingabe(DE04_UEBER_WIDERSPRUCH);
    }

    if (dto.stammdatenPii === undefined && dto.endkundengruppe === undefined) {
      throw ungueltigeEingabe('Es muss mindestens `stammdatenPii` oder `endkundengruppe` gesetzt sein.');
    }

    const existing = await this.endkundeRepository.findById(id);
    if (existing === undefined) {
      throw nichtGefunden('Endkunde');
    }

    let neueChiffrate: { readonly nameEnc: Buffer; readonly anschriftEnc: Buffer; readonly kontaktEnc: Buffer | null } | undefined;

    if (dto.stammdatenPii !== undefined) {
      const pii = await this.endkundePiiRepository.findByPseudonymId(id);
      if (pii === undefined) {
        throw nichtGefunden('Endkunde-PII');
      }

      const subjektSchluessel = await this.subjektSchluesselRepository.findById(pii.cryptoKeyId);
      if (subjektSchluessel === undefined) {
        throw nichtGefunden('Endkunde-Schluessel');
      }

      // KMS-Un-Wrap VOR der inneren NESTED-Schreib-Tx (SAVEPOINT) — NICHT vor
      // der äußeren, vom globalen TransactionInterceptor bereits BEGONNENEN
      // Request-Tx. S. Kommentar in `anlegen()`/`KeyManagementPort` zum
      // tatsächlichen Stand des §19-Constraints (ADR-0008 §29(C), offen für
      // einen echten Cloud-KMS-Adapter).
      const dek = await this.keyManagementPort.unwrapDek({
        wrappedDek: subjektSchluessel.wrappedDek,
        kmsKeyId: subjektSchluessel.kmsKeyId,
        algVersion: subjektSchluessel.algVersion,
      });

      neueChiffrate = {
        nameEnc: this.fieldCipher.encrypt(dek, id, FELD_NAME, dto.stammdatenPii.name),
        anschriftEnc: this.fieldCipher.encrypt(dek, id, FELD_ANSCHRIFT, dto.stammdatenPii.anschrift),
        kontaktEnc:
          dto.stammdatenPii.kontakt !== undefined
            ? this.fieldCipher.encrypt(dek, id, FELD_KONTAKT, dto.stammdatenPii.kontakt)
            : null,
      };
    }

    const endkunde = await this.aendernInTx(id, undefined, neueChiffrate, dto.endkundengruppe);
    const stammdatenPii = await this.resolvePiiFuerAntwort(id, subject, endkunde.verarbeitungsStatus);
    return mapEndkundeDetail(endkunde, stammdatenPii);
  }

  @Transactional(Propagation.Nested)
  private async aendernInTx(
    id: string,
    vonWissAuswertungAusgenommen: boolean | undefined,
    neueChiffrate: { readonly nameEnc: Buffer; readonly anschriftEnc: Buffer; readonly kontaktEnc: Buffer | null } | undefined,
    endkundengruppe?: string,
  ): Promise<Endkunde> {
    if (neueChiffrate !== undefined) {
      await this.endkundePiiRepository.updateByPseudonymId(id, neueChiffrate);
    }

    if (vonWissAuswertungAusgenommen !== undefined) {
      await this.endkundeRepository.updateVonWissAuswertungAusgenommen(id, vonWissAuswertungAusgenommen);
    }

    if (endkundengruppe !== undefined) {
      await this.endkundeRepository.updateEndkundengruppe(id, endkundengruppe);
    }

    const endkunde = await this.endkundeRepository.findById(id);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }
    return endkunde;
  }

  /**
   * Art. 18 (Sperre) mit PFLICHT-Grund — ADR-0007 A11.1/A11.2 (C8-Folgeauftrag).
   *
   * Idempotenz ist jetzt an den Grund gebunden. Der frueher hier wirksame
   * stille Idempotenz-Fallback (`markGesperrt()` lief ins Leere, `findById()`
   * lieferte die bereits gesperrte Zeile, Antwort 200) waere mit einem
   * Grund-Parameter die gefaehrlichste Variante gewesen: der mitgelieferte
   * Grund wuerde VERWORFEN, die Antwort trotzdem 200 — der Sachbearbeiter
   * glaubt dokumentiert zu haben, die Datenbank haelt nichts, und der
   * Preflight schliesst das Paar weiter fail-closed aus (FJ-07c). Fail-open in
   * der Wahrnehmung bei Fail-closed in der Wirkung.
   *
   * Daher (A11.2):
   * - `aktiv`                              -> sperren, 200
   * - `gesperrt`, GLEICHER Grund           -> 200, unveraendert (idempotent)
   * - `gesperrt`, ABWEICHENDER Grund       -> 409, KEIN Schreibvorgang
   * - `gesperrt`, Grund fehlt (Bestand)    -> 409 (Nacherfassung ist A11.9,
   *                                          eigener Vorgang, nie als
   *                                          Seiteneffekt von `sperren()`)
   * - `geloescht`                          -> 409, niemals stille Quittung
   *
   * Ein bestehender Grund wird durch diesen Pfad NIEMALS ueberschrieben. Ein
   * Wechsel 1a -> 1d ist eine inhaltliche Aenderung des Art.-18-Vorgangs
   * (andere Frist, andere Wirkung im Nachweis, ggf. Art.-19-Ausloeser) und
   * braucht einen eigenen dokumentierten Vorgang.
   */
  async sperren(
    id: string,
    grund: EinschraenkungGrundCode,
    neuerhebungFortsetzenEingabe: boolean | undefined,
    subject: SecurityContext,
  ): Promise<EndkundeDetail> {
    // Auflage C-8: ZUERST validieren, dann lesen. Eine unzulaessige
    // Kombination aus Grund und Entscheidung ist ein Eingabefehler und soll
    // nicht erst nach einem Datenbank-Roundtrip auffallen.
    const neuerhebungFortsetzen = pruefeNeuerhebungsEntscheidung(grund, neuerhebungFortsetzenEingabe, 'Endkunde');

    const existing = await this.endkundeRepository.findById(id);
    if (existing === undefined) {
      throw nichtGefunden('Endkunde');
    }

    if (entscheideSperre(existing, grund, 'Endkunde', neuerhebungFortsetzen) === 'idempotent') {
      const stammdatenPii = await this.resolvePiiFuerAntwort(id, subject, existing.verarbeitungsStatus);
      return mapEndkundeDetail(existing, stammdatenPii);
    }

    const endkunde = await this.sperrenInTx(id, grund, neuerhebungFortsetzen);
    const stammdatenPii = await this.resolvePiiFuerAntwort(id, subject, endkunde.verarbeitungsStatus);
    return mapEndkundeDetail(endkunde, stammdatenPii);
  }


  /**
   * Art. 18 Abs. 3 DSGVO — Unterrichtung VOR der Aufhebung dokumentieren
   * (Schritt 1 von 2, ADR-0007 A11.10).
   *
   * Der Nachweis wird an GENAU DIESE Einschraenkung gebunden (`gesperrtSeit`).
   * Ohne diese Bindung wuerde eine Unterrichtung aus einer frueheren
   * Einschraenkung eine spaetere aufsperren — Subjekte koennen mehrfach
   * nacheinander eingeschraenkt werden.
   *
   * Nur sinnvoll (und nur erlaubt) im Zustand `gesperrt`: eine Unterrichtung
   * ueber die Aufhebung einer nicht bestehenden Einschraenkung waere ein
   * inhaltsleerer Beleg.
   */
  async unterrichten(id: string, kanal: UnterrichtungKanal, subject: SecurityContext): Promise<EndkundeDetail> {
    const subjekt = await this.endkundeRepository.findById(id);
    if (subjekt === undefined) {
      throw nichtGefunden('Endkunde');
    }

    if (subjekt.verarbeitungsStatus !== 'gesperrt' || subjekt.gesperrtSeit === null || subjekt.gesperrtSeit === undefined) {
      throw konflikt(
        'Endkunde: es besteht keine Verarbeitungseinschraenkung, ueber deren Aufhebung unterrichtet werden koennte.',
      );
    }

    await this.unterrichtungRepository.insert({
      id: randomUUID(),
      subjekt: { endkundeId: id },
      gesperrtSeit: subjekt.gesperrtSeit,
      kanal,
      unterrichtetVonSub: subject.sub,
    });

    // Der Service emittiert selbst (kein `@AuditAction`) — s. Controller-Kommentar.
    await this.auditService.append({
      eventTyp: STAMMDATEN_EVENT_CODES.ENDKUNDE_EINSCHRAENKUNG_UNTERRICHTET,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: id,
      kontext: { synthetic: true, kanal },
    });

    const stammdatenPii = await this.resolvePiiFuerAntwort(id, subject, subjekt.verarbeitungsStatus);
    return mapEndkundeDetail(subjekt, stammdatenPii);
  }

  /**
   * Aufhebung der Art.-18-Einschraenkung (Schritt 2, ADR-0007 A11.7/A11.10).
   *
   * FAIL-CLOSED gegen Schritt 1: ohne einen an dieselbe Einschraenkung
   * gebundenen Unterrichtungs-Nachweis wird abgelehnt. Art. 18 Abs. 3 ist
   * eine Ordnungsvorschrift MIT Reihenfolge — sie laesst sich nur belegen,
   * wenn der erste Schritt vor dem zweiten stattgefunden hat.
   *
   * Bereits `aktiv` => 200 idempotent. `geloescht` => 409 (s.
   * `entscheideAufhebung()`).
   */
  async entsperren(id: string, subject: SecurityContext): Promise<EndkundeDetail> {
    const existing = await this.endkundeRepository.findById(id);
    if (existing === undefined) {
      throw nichtGefunden('Endkunde');
    }

    if (entscheideAufhebung(existing, 'Endkunde') === 'idempotent') {
      const stammdatenPii = await this.resolvePiiFuerAntwort(id, subject, existing.verarbeitungsStatus);
      return mapEndkundeDetail(existing, stammdatenPii);
    }

    const gesperrtSeit = existing.gesperrtSeit;
    if (gesperrtSeit === null || gesperrtSeit === undefined) {
      // Bestandsdaten-Fall: `gesperrt` ohne `gesperrt_seit` ist per
      // Kohaerenz-CHECK (V0024) nur zusammen mit fehlendem Grund moeglich.
      // Ohne Zeitanker laesst sich kein Nachweis binden — also kein
      // stillschweigendes Durchwinken.
      throw fehlenderUnterrichtungsNachweis('Endkunde');
    }

    const nachweis = await this.unterrichtungRepository.findFuerSperre({ endkundeId: id }, gesperrtSeit);
    if (nachweis === undefined) {
      throw fehlenderUnterrichtungsNachweis('Endkunde');
    }

    // VOR dem UPDATE lesen: danach ist der Grund genullt und die Audit-Zeile
    // truege nicht mehr, WAS aufgehoben wurde.
    //
    // Dass er hier gesetzt IST, garantiert `ck_endkunde_einschraenkung_kohaerenz`
    // (V0024): `gesperrt_seit` gesetzt ERZWINGT einen gesetzten Grund — und
    // `gesperrt_seit` ist durch den Guard oben bereits sichergestellt. Die
    // Invariante wird dennoch geprueft statt unterstellt: waere sie verletzt,
    // schriebe die Anwendung eine Audit-Zeile ohne Aussage und hoebe zugleich
    // eine Einschraenkung auf, deren Grundlage niemand mehr kennt.
    const aufgehobenerGrund = existing.einschraenkungGrundCode;
    if (aufgehobenerGrund === null || aufgehobenerGrund === undefined) {
      throw new Error(
        'energy.endkunde: Verarbeitungsstatus gesperrt mit gesetztem gesperrt_seit, aber ohne ' +
          'einschraenkung_grund_code — Schema-Verletzung (ck_endkunde_einschraenkung_kohaerenz, V0024). ' +
          'Fail-closed statt Aufhebung ohne dokumentierte Grundlage.',
      );
    }

    const aufgehoben = await this.entsperrenInTx(id);

    await this.auditService.append({
      eventTyp: STAMMDATEN_EVENT_CODES.ENDKUNDE_ENTSPERRT,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: id,
      kontext: { synthetic: true, einschraenkung_grund_code: aufgehobenerGrund },
    });
    const stammdatenPii = await this.resolvePiiFuerAntwort(id, subject, aufgehoben.verarbeitungsStatus);
    return mapEndkundeDetail(aufgehoben, stammdatenPii);
  }

  @Transactional(Propagation.Nested)
  private async entsperrenInTx(id: string): Promise<Endkunde> {
    // BEIDE Namensraeume, symmetrisch zum Sperren: bliebe `pii_status` auf
    // `gesperrt`, waere das Subjekt fachlich aktiv, seine PII aber weiter
    // maskiert — eine halbe Aufhebung, die wie ein Anzeigefehler aussieht.
    await this.endkundePiiRepository.markAktiv(id);
    const aufgehoben = await this.endkundeRepository.markEntsperrt(id);
    if (aufgehoben !== undefined) {
      return aufgehoben;
    }

    throw konflikt(
      'Endkunde: die Einschraenkung konnte nicht aufgehoben werden — der Zustand hat sich waehrend der Verarbeitung geaendert.',
    );
  }

  @Transactional(Propagation.Nested)
  private async sperrenInTx(
    id: string,
    grund: EinschraenkungGrundCode,
    neuerhebungFortsetzen: boolean | null,
  ): Promise<Endkunde> {
    await this.endkundePiiRepository.markGesperrt(id);
    const endkunde = await this.endkundeRepository.markGesperrt(id, grund, neuerhebungFortsetzen);
    if (endkunde !== undefined) {
      return endkunde;
    }

    // Wettlauf: zwischen Vorab-Check und UPDATE hat ein anderer Aufruf den
    // Status veraendert (der `WHERE ... = 'aktiv'`-Guard hat gegriffen).
    // Dieselbe Entscheidung erneut anwenden — gleicher Grund bleibt idempotent,
    // alles andere ist ein Konflikt. NICHT stillschweigend 200 liefern.
    const nachher = await this.endkundeRepository.findById(id);
    if (nachher === undefined) {
      throw nichtGefunden('Endkunde');
    }

    if (entscheideSperre(nachher, grund, 'Endkunde', neuerhebungFortsetzen) === 'idempotent') {
      return nachher;
    }

    throw konflikt('Der Endkunde konnte nicht eingeschraenkt werden — der Zustand hat sich waehrend der Verarbeitung geaendert.');
  }

  /**
   * Art. 17 (Krypto-Shredding) — IDEMPOTENT. Der Idempotenz-Anker ist
   * bewusst der `energy.endkunde.verarbeitungs_status` (NICHT ein erneuter
   * `identity.endkunde_pii`-Lookup): nach dem ERSTEN erfolgreichen Shredding
   * ist `pseudonym_id` bereits neutralisiert (s.
   * `IdentityEndkundePiiRepository.neutralisiereUndMarkGeloescht`) — ein
   * zweiter `findByPseudonymId(id)`-Aufruf würde naturgemäß leerlaufen. Der
   * VORAB-Check auf `verarbeitungsStatus==='geloescht'` verhindert daher
   * einen zweiten, fälschlich als "Subjekt nicht gefunden" interpretierten
   * Durchlauf und liefert stattdessen den erwarteten idempotenten 200er.
   *
   * `antragId`/`subject` (ADR-0005 §26.5, NEU) — durchgereicht vom EINZIGEN
   * Aufrufer (`ShredAntragService.freigebenInTx`, ADR-0009): `antragId`
   * verkettet die begleitenden Geraete-Shred-Audit-Zeilen mit dem
   * uebergeordneten Vier-Augen-Antrag (`kontext.antrag_id`, V0015); `subject`
   * ist derselbe Freigeber-Akteur, der bereits `endkunde.stammdaten.
   * geschreddert` traegt — EINE Vier-Augen-Kontrollspur fuer Personen- UND
   * Geraete-Dimension.
   */
  async shred(id: string, antragId: string, subject: SecurityContext): Promise<ShreddingErgebnis> {
    const existing = await this.endkundeRepository.findById(id);
    if (existing === undefined) {
      throw nichtGefunden('Endkunde');
    }

    if (existing.verarbeitungsStatus === 'geloescht') {
      // Idempotenter Wiederholungsaufruf: nichts wird erneut geschreddert,
      // aber der Nachweis-Bestand (P5b/A7) besteht weiter — ehrlich ausweisen.
      const bestand = await this.nachweisBestandRepository.zaehleNachweisgebundeneBestaende(id);
      return {
        id,
        verarbeitungsStatus: 'geloescht',
        geschreddert: true,
        standortPiiNeutralisiert: 0,
        analyticsLaeufeUnveraendert: bestand.analyticsLaeufe,
        einflussIntervalleUnveraendert: bestand.einflussIntervalle,
      };
    }

    return this.shredInTx(id, antragId, subject);
  }

  @Transactional(Propagation.Nested)
  private async shredInTx(id: string, antragId: string, subject: SecurityContext): Promise<ShreddingErgebnis> {
    const pii = await this.endkundePiiRepository.findByPseudonymId(id);
    let standortPiiNeutralisiert = 0;
    if (pii !== undefined) {
      await this.kryptoShreddingService.shred(pii.cryptoKeyId);
      await this.endkundePiiRepository.neutralisiereUndMarkGeloescht(id);

      // ADR-0010 D4 — Standort-PII-Shred-Kopplung (neue Dimension, analog
      // ADR-0005 §26 GB-C): der DEK ist bereits vernichtet (Zeile oben) —
      // ALLE Standorte dieses Endkunden teilen denselben `crypto_key_id`
      // (D4/A2, "Standort-DEK == Endkunden-DEK"), sind also bereits durch
      // die DEK-Vernichtung unlesbar. Diese Zeile NEUTRALISIERT zusätzlich
      // jede `identity.standort_pii`-Zeile (kappt die logische
      // `pseudonym_id`-Kopplung, analog `endkundePiiRepository.
      // neutralisiereUndMarkGeloescht`) UND liefert den geforderten
      // Shred-Report-Nachweis (Anzahl betroffener Standorte,
      // `ShreddingErgebnis.standortPiiNeutralisiert`).
      standortPiiNeutralisiert = await this.standortPiiRepository.neutralisiereAlleUndMarkGeloeschtByCryptoKeyId(
        pii.cryptoKeyId,
      );
    }

    await this.endkundeRepository.markGeloescht(id);

    // ADR-0005 §26.5 — Geraete-Zuordnungs-Shred-Kopplung (device-Dimension,
    // GB-C): "alle" (nicht nur die aktuell aktive) Zuordnungen der Zaehler
    // dieses Endkunden — s. `DeviceGeraetZuordnungRepository.
    // findByZaehlerIds`-Kommentar zur Vollstaendigkeits-Begruendung. JOIN
    // bleibt innerhalb `energy.*` (kein Namensraum-Bruch,
    // `EnergyZaehlerRepository.listIdsByEndkundeId`).
    const zaehlerIds = await this.zaehlerRepository.listIdsByEndkundeId(id);
    if (zaehlerIds.length > 0) {
      const zuordnungen = await this.geraetZuordnungRepository.findByZaehlerIds(zaehlerIds);
      // Sequenzielle Shreds derselben Tx (kleine Menge je Endkunde) — bewusst
      // kein Promise.all (eine gemeinsame DB-Verbindung/Savepoint-Kette
      // erlaubt keine parallelen Queries, analog `MesskonzeptService`).
      for (const zuordnung of zuordnungen) {
        await this.deviceKryptoShreddingService.shred({
          cryptoKeyId: zuordnung.cryptoKeyId,
          zaehlerId: zuordnung.zaehlerId,
          antragId,
          subject,
        });
      }
    }

    // P5b/A7 — Nachweis-gebundene Bestände, die den Shred BEWUSST überleben
    // (Art. 17(3)(b)): pseudonyme Berechnungsläufe (`analytics`) und
    // Einflussgrößen-Intervalle (`einfluss`) werden NICHT gelöscht. Rein
    // lesend, nach dem eigentlichen Shred — der Report weist damit die
    // tatsächlich verbliebenen Bestände aus statt eine Vollständigkeit zu
    // behaupten, die nicht besteht.
    const bestand = await this.nachweisBestandRepository.zaehleNachweisgebundeneBestaende(id);

    return {
      id,
      verarbeitungsStatus: 'geloescht',
      geschreddert: true,
      standortPiiNeutralisiert,
      analyticsLaeufeUnveraendert: bestand.analyticsLaeufe,
      einflussIntervalleUnveraendert: bestand.einflussIntervalle,
    };
  }

  /**
   * ADR-0008 §18 (D6) — ruft `IdentityRepository`+`FieldCipherService` ERST
   * NACH `PiiProjektionsPolicy.darfPiiSehen()===true` (kein "PII-
   * Entschlüsseln auf Vorrat").
   */
  private async resolvePiiFuerAntwort(
    id: string,
    subject: SecurityContext,
    verarbeitungsStatus: 'aktiv' | 'gesperrt' | 'geloescht',
  ): Promise<EndkundePiiResponse | null> {
    if (!this.piiProjektionsPolicy.darfPiiSehen(subject, { verarbeitungsStatus })) {
      return null;
    }

    const pii = await this.endkundePiiRepository.findByPseudonymId(id);
    if (pii === undefined) {
      return null;
    }

    const subjektSchluessel = await this.subjektSchluesselRepository.findById(pii.cryptoKeyId);
    if (subjektSchluessel === undefined || subjektSchluessel.keyState === 'geschreddert') {
      return null;
    }

    const dek = await this.keyManagementPort.unwrapDek({
      wrappedDek: subjektSchluessel.wrappedDek,
      kmsKeyId: subjektSchluessel.kmsKeyId,
      algVersion: subjektSchluessel.algVersion,
    });

    return {
      name: this.fieldCipher.decrypt(dek, id, FELD_NAME, pii.nameEnc),
      anschrift: this.fieldCipher.decrypt(dek, id, FELD_ANSCHRIFT, pii.anschriftEnc),
      kontakt: pii.kontaktEnc === null ? null : this.fieldCipher.decrypt(dek, id, FELD_KONTAKT, pii.kontaktEnc),
    };
  }
}
