import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import type { SecurityContext } from '../../common/security/security-context';
import { EnergyEndkundeRepository } from '../persistence/energy/energy-endkunde.repository';
import { EnergyAnschlussnutzerRepository } from '../persistence/energy/energy-anschlussnutzer.repository';
import type { Anschlussnutzer } from '../persistence/energy/energy-anschlussnutzer.repository';
import { IdentityAnschlussnutzerPiiRepository } from '../persistence/identity/identity-anschlussnutzer-pii.repository';
import { IdentitySubjektSchluesselRepository } from '../persistence/identity/identity-subjekt-schluessel.repository';
import { KEY_MANAGEMENT_PORT } from '../../common/crypto/key-management.port';
import type { KeyManagementPort } from '../../common/crypto/key-management.port';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import { PiiProjektionsPolicy } from '../pii/pii-projektions.policy';
import { paginate } from '../persistence/cursor.util';
import { toSeite } from '../common/seite.dto';
import type { Seite } from '../common/seite.dto';
import type { EinschraenkungGrundCode } from '../../nachweis/domain/paar-einschraenkung';
import { konflikt, nichtGefunden } from '../common/problem.util';
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
import { mapAnschlussnutzerDetail, mapAnschlussnutzerListItem } from './anschlussnutzer.mapper';
import type { AnschlussnutzerDetail, AnschlussnutzerListItem, AnschlussnutzerPiiResponse } from './anschlussnutzer.types';
import type { AnschlussnutzerAnlegenDto } from './dto/anschlussnutzer-anlegen.dto';

const FELD_NAME = 'name';
const FELD_KONTAKT = 'kontakt';

interface AnlegenTxInput {
  readonly anschlussnutzerId: string;
  readonly endkundeId: string;
  readonly subjektSchluesselId: string;
  readonly wrappedDek: Buffer;
  readonly kmsKeyId: string;
  readonly algVersion: number;
  readonly nameEnc: Buffer;
  readonly kontaktEnc: Buffer | null;
}

/** ADR-0008 §20 (D8) — analog `EndkundeService`, DS-07-Datensubjekt. */
@Injectable()
export class AnschlussnutzerService {
  constructor(
    private readonly anschlussnutzerRepository: EnergyAnschlussnutzerRepository,
    private readonly endkundeRepository: EnergyEndkundeRepository,
    private readonly anschlussnutzerPiiRepository: IdentityAnschlussnutzerPiiRepository,
    private readonly unterrichtungRepository: EnergyEinschraenkungUnterrichtungRepository,
    private readonly auditService: AuditService,
    private readonly subjektSchluesselRepository: IdentitySubjektSchluesselRepository,
    @Inject(KEY_MANAGEMENT_PORT) private readonly keyManagementPort: KeyManagementPort,
    private readonly fieldCipher: FieldCipherService,
    private readonly piiProjektionsPolicy: PiiProjektionsPolicy,
  ) {}

  async liste(options: {
    readonly cursor?: string;
    readonly limit: number;
    readonly endkundeId?: string;
  }): Promise<Seite<AnschlussnutzerListItem>> {
    const rows = await this.anschlussnutzerRepository.listPage(options);
    const { daten, naechsterCursor } = paginate(rows, options.limit);
    return toSeite(daten.map(mapAnschlussnutzerListItem), naechsterCursor, options.limit);
  }

  async detail(id: string, subject: SecurityContext): Promise<AnschlussnutzerDetail> {
    const anschlussnutzer = await this.anschlussnutzerRepository.findById(id);
    if (anschlussnutzer === undefined) {
      throw nichtGefunden('Anschlussnutzer');
    }

    const stammdatenPii = await this.resolvePiiFuerAntwort(id, subject, anschlussnutzer.verarbeitungsStatus);
    return mapAnschlussnutzerDetail(anschlussnutzer, stammdatenPii);
  }

  /**
   * Art. 18 (Sperre) mit PFLICHT-Grund — ADR-0007 A11.6, symmetrisch zu
   * `EndkundeService.sperren()`.
   *
   * Warum dieser Pfad ueberhaupt gebaut wird: der Anschlussnutzer ist eine
   * EIGENE betroffene Person mit eigenen Betroffenenrechten. Der
   * Preflight WERTET seine Sperre bereits aus (FJ-11a/b/c, ADR-0006 P4 /
   * ADR-0007 A12), aber bis hierher konnte sie ueber die API gar nicht
   * GESETZT werden — uebte ein Anschlussnutzer Art. 18 aus, hatte der
   * Verantwortliche keinen Mechanismus. Erschwerend sichert
   * `compliance/dsgvo/betroffenenrechte.md` bereits zu, Endkunde und
   * Anschlussnutzer seien unabhaengig voneinander sperrbar — eine Zusage, die
   * bis zu diesem Commit unwahr war.
   *
   * Die 200/409-Entscheidung faellt in `entscheideSperre()` — DIESELBE Regel
   * wie beim Endkunden, bewusst nicht kopiert.
   */
  async sperren(
    id: string,
    grund: EinschraenkungGrundCode,
    neuerhebungFortsetzenEingabe: boolean | undefined,
    subject: SecurityContext,
  ): Promise<AnschlussnutzerDetail> {
    // Auflage C-8: ZUERST validieren, dann lesen. Eine unzulaessige
    // Kombination aus Grund und Entscheidung ist ein Eingabefehler und soll
    // nicht erst nach einem Datenbank-Roundtrip auffallen.
    const neuerhebungFortsetzen = pruefeNeuerhebungsEntscheidung(grund, neuerhebungFortsetzenEingabe, 'Anschlussnutzer');

    const existing = await this.anschlussnutzerRepository.findById(id);
    if (existing === undefined) {
      throw nichtGefunden('Anschlussnutzer');
    }

    if (entscheideSperre(existing, grund, 'Anschlussnutzer', neuerhebungFortsetzen) === 'idempotent') {
      const stammdatenPii = await this.resolvePiiFuerAntwort(id, subject, existing.verarbeitungsStatus);
      return mapAnschlussnutzerDetail(existing, stammdatenPii);
    }

    const anschlussnutzer = await this.sperrenInTx(id, grund, neuerhebungFortsetzen);
    const stammdatenPii = await this.resolvePiiFuerAntwort(id, subject, anschlussnutzer.verarbeitungsStatus);
    return mapAnschlussnutzerDetail(anschlussnutzer, stammdatenPii);
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
  async unterrichten(id: string, kanal: UnterrichtungKanal, subject: SecurityContext): Promise<AnschlussnutzerDetail> {
    const subjekt = await this.anschlussnutzerRepository.findById(id);
    if (subjekt === undefined) {
      throw nichtGefunden('Anschlussnutzer');
    }

    if (subjekt.verarbeitungsStatus !== 'gesperrt' || subjekt.gesperrtSeit === null || subjekt.gesperrtSeit === undefined) {
      throw konflikt(
        'Anschlussnutzer: es besteht keine Verarbeitungseinschraenkung, ueber deren Aufhebung unterrichtet werden koennte.',
      );
    }

    await this.unterrichtungRepository.insert({
      id: randomUUID(),
      subjekt: { anschlussnutzerId: id },
      gesperrtSeit: subjekt.gesperrtSeit,
      kanal,
      unterrichtetVonSub: subject.sub,
    });

    // Der Service emittiert selbst (kein `@AuditAction`) — s. Controller-Kommentar.
    await this.auditService.append({
      eventTyp: STAMMDATEN_EVENT_CODES.ANSCHLUSSNUTZER_EINSCHRAENKUNG_UNTERRICHTET,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: id,
      kontext: { synthetic: true, kanal },
    });

    const stammdatenPii = await this.resolvePiiFuerAntwort(id, subject, subjekt.verarbeitungsStatus);
    return mapAnschlussnutzerDetail(subjekt, stammdatenPii);
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
  async entsperren(id: string, subject: SecurityContext): Promise<AnschlussnutzerDetail> {
    const existing = await this.anschlussnutzerRepository.findById(id);
    if (existing === undefined) {
      throw nichtGefunden('Anschlussnutzer');
    }

    if (entscheideAufhebung(existing, 'Anschlussnutzer') === 'idempotent') {
      const stammdatenPii = await this.resolvePiiFuerAntwort(id, subject, existing.verarbeitungsStatus);
      return mapAnschlussnutzerDetail(existing, stammdatenPii);
    }

    const gesperrtSeit = existing.gesperrtSeit;
    if (gesperrtSeit === null || gesperrtSeit === undefined) {
      // Bestandsdaten-Fall: `gesperrt` ohne `gesperrt_seit` ist per
      // Kohaerenz-CHECK (V0024) nur zusammen mit fehlendem Grund moeglich.
      // Ohne Zeitanker laesst sich kein Nachweis binden — also kein
      // stillschweigendes Durchwinken.
      throw fehlenderUnterrichtungsNachweis('Anschlussnutzer');
    }

    const nachweis = await this.unterrichtungRepository.findFuerSperre({ anschlussnutzerId: id }, gesperrtSeit);
    if (nachweis === undefined) {
      throw fehlenderUnterrichtungsNachweis('Anschlussnutzer');
    }

    // VOR dem UPDATE lesen: danach ist der Grund genullt und die Audit-Zeile
    // truege nicht mehr, WAS aufgehoben wurde.
    //
    // Dass er hier gesetzt IST, garantiert `ck_anschlussnutzer_einschraenkung_kohaerenz`
    // (V0024): `gesperrt_seit` gesetzt ERZWINGT einen gesetzten Grund — und
    // `gesperrt_seit` ist durch den Guard oben bereits sichergestellt. Die
    // Invariante wird dennoch geprueft statt unterstellt: waere sie verletzt,
    // schriebe die Anwendung eine Audit-Zeile ohne Aussage und hoebe zugleich
    // eine Einschraenkung auf, deren Grundlage niemand mehr kennt.
    const aufgehobenerGrund = existing.einschraenkungGrundCode;
    if (aufgehobenerGrund === null || aufgehobenerGrund === undefined) {
      throw new Error(
        'energy.anschlussnutzer: Verarbeitungsstatus gesperrt mit gesetztem gesperrt_seit, aber ohne ' +
          'einschraenkung_grund_code — Schema-Verletzung (ck_anschlussnutzer_einschraenkung_kohaerenz, V0024). ' +
          'Fail-closed statt Aufhebung ohne dokumentierte Grundlage.',
      );
    }

    const aufgehoben = await this.entsperrenInTx(id);

    await this.auditService.append({
      eventTyp: STAMMDATEN_EVENT_CODES.ANSCHLUSSNUTZER_ENTSPERRT,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: id,
      kontext: { synthetic: true, einschraenkung_grund_code: aufgehobenerGrund },
    });
    const stammdatenPii = await this.resolvePiiFuerAntwort(id, subject, aufgehoben.verarbeitungsStatus);
    return mapAnschlussnutzerDetail(aufgehoben, stammdatenPii);
  }

  @Transactional(Propagation.Nested)
  private async entsperrenInTx(id: string): Promise<Anschlussnutzer> {
    // BEIDE Namensraeume, symmetrisch zum Sperren: bliebe `pii_status` auf
    // `gesperrt`, waere das Subjekt fachlich aktiv, seine PII aber weiter
    // maskiert — eine halbe Aufhebung, die wie ein Anzeigefehler aussieht.
    await this.anschlussnutzerPiiRepository.markAktiv(id);
    const aufgehoben = await this.anschlussnutzerRepository.markEntsperrt(id);
    if (aufgehoben !== undefined) {
      return aufgehoben;
    }

    throw konflikt(
      'Anschlussnutzer: die Einschraenkung konnte nicht aufgehoben werden — der Zustand hat sich waehrend der Verarbeitung geaendert.',
    );
  }

  @Transactional(Propagation.Nested)
  private async sperrenInTx(
    id: string,
    grund: EinschraenkungGrundCode,
    neuerhebungFortsetzen: boolean | null,
  ): Promise<Anschlussnutzer> {
    // BEIDE Namensraeume, wie beim Endkunden: `energy` traegt den fachlichen
    // Status samt Grund, `identity` den PII-Status (der die Projektion
    // fail-closed maskiert).
    await this.anschlussnutzerPiiRepository.markGesperrt(id);
    const anschlussnutzer = await this.anschlussnutzerRepository.markGesperrt(id, grund, neuerhebungFortsetzen);
    if (anschlussnutzer !== undefined) {
      return anschlussnutzer;
    }

    // Wettlauf: zwischen Vorab-Check und UPDATE hat ein anderer Aufruf den
    // Status veraendert (der `WHERE ... = 'aktiv'`-Guard hat gegriffen).
    // Dieselbe Entscheidung erneut anwenden statt stillschweigend 200 zu
    // liefern.
    const nachher = await this.anschlussnutzerRepository.findById(id);
    if (nachher === undefined) {
      throw nichtGefunden('Anschlussnutzer');
    }

    if (entscheideSperre(nachher, grund, 'Anschlussnutzer', neuerhebungFortsetzen) === 'idempotent') {
      return nachher;
    }

    throw konflikt(
      'Der Anschlussnutzer konnte nicht eingeschraenkt werden — der Zustand hat sich waehrend der Verarbeitung geaendert.',
    );
  }

  async anlegen(dto: AnschlussnutzerAnlegenDto, subject: SecurityContext): Promise<AnschlussnutzerDetail> {
    const endkunde = await this.endkundeRepository.findById(dto.endkundeId);
    if (endkunde === undefined) {
      throw nichtGefunden('Endkunde');
    }

    const generatedKey = await this.keyManagementPort.generateDataKey();
    const anschlussnutzerId = randomUUID();

    const nameEnc = this.fieldCipher.encrypt(generatedKey.dek, anschlussnutzerId, FELD_NAME, dto.stammdatenPii.name);
    const kontaktEnc =
      dto.stammdatenPii.kontakt !== undefined
        ? this.fieldCipher.encrypt(generatedKey.dek, anschlussnutzerId, FELD_KONTAKT, dto.stammdatenPii.kontakt)
        : null;

    const anschlussnutzer = await this.anlegenInTx({
      anschlussnutzerId,
      endkundeId: dto.endkundeId,
      subjektSchluesselId: randomUUID(),
      wrappedDek: generatedKey.wrappedDek,
      kmsKeyId: generatedKey.kmsKeyId,
      algVersion: generatedKey.algVersion,
      nameEnc,
      kontaktEnc,
    });

    const stammdatenPii: AnschlussnutzerPiiResponse | null = this.piiProjektionsPolicy.darfPiiSehen(subject, {
      verarbeitungsStatus: anschlussnutzer.verarbeitungsStatus,
    })
      ? { name: dto.stammdatenPii.name, kontakt: dto.stammdatenPii.kontakt ?? null }
      : null;

    return mapAnschlussnutzerDetail(anschlussnutzer, stammdatenPii);
  }

  @Transactional(Propagation.Nested)
  private async anlegenInTx(input: AnlegenTxInput): Promise<Anschlussnutzer> {
    await this.subjektSchluesselRepository.insert({
      id: input.subjektSchluesselId,
      wrappedDek: input.wrappedDek,
      kmsKeyId: input.kmsKeyId,
      algVersion: input.algVersion,
    });

    await this.anschlussnutzerPiiRepository.insert({
      id: randomUUID(),
      pseudonymId: input.anschlussnutzerId,
      cryptoKeyId: input.subjektSchluesselId,
      nameEnc: input.nameEnc,
      kontaktEnc: input.kontaktEnc,
    });

    return this.anschlussnutzerRepository.insert({ id: input.anschlussnutzerId, endkundeId: input.endkundeId });
  }

  private async resolvePiiFuerAntwort(
    id: string,
    subject: SecurityContext,
    verarbeitungsStatus: 'aktiv' | 'gesperrt' | 'geloescht',
  ): Promise<AnschlussnutzerPiiResponse | null> {
    if (!this.piiProjektionsPolicy.darfPiiSehen(subject, { verarbeitungsStatus })) {
      return null;
    }

    const pii = await this.anschlussnutzerPiiRepository.findByPseudonymId(id);
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
      kontakt: pii.kontaktEnc === null ? null : this.fieldCipher.decrypt(dek, id, FELD_KONTAKT, pii.kontaktEnc),
    };
  }
}
