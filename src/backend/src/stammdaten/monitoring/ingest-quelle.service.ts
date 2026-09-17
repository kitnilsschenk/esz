import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { AuditService } from '../../audit/audit.service';
import type { SecurityContext } from '../../common/security/security-context';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import { KEY_MANAGEMENT_PORT, type KeyManagementPort } from '../../common/crypto/key-management.port';
import { konflikt, nichtGefunden, ungueltigeEingabe } from '../common/problem.util';
import { IngestQuelleRepository, type IngestQuelle } from '../persistence/ingest/ingest-quelle.repository';
import { IngestQuelleSchluesselRepository } from '../persistence/ingest/ingest-quelle-schluessel.repository';
import { GEHEIMNIS_FELDER, type GeheimnisFeld, type IngestQuelleItem, type TlsModus } from './ingest-quelle.types';
import { istAbgelaufen, leseGueltigBis } from './zertifikat-gueltigkeit.util';
import type { QuelleAnlegenDto } from './dto/quelle-anlegen.dto';
import type { QuelleAendernDto } from './dto/quelle-aendern.dto';

/**
 * Verwaltung der Datenquellen (`ingest.quelle`, V0059).
 *
 * WO DIE GEHEIMNISSE VERSCHLÜSSELT WERDEN — UND WO NICHT
 * ------------------------------------------------------
 * Ausschließlich hier. Der Controller sieht Klartext (er nimmt ihn vom
 * Formular entgegen), das Repository sieht nur noch Chiffrate, und die
 * Antwort trägt beides nicht. Zwischen Controller und Datenbank gibt es
 * keinen Weg, auf dem ein Klartext-Geheimnis versehentlich stehen bliebe.
 *
 * Jedes Chiffrat wird über die AAD an `(quelleId, feldname)` gebunden. Ein
 * Chiffrat aus einer anderen Quelle oder einem anderen Feld entschlüsselt
 * nicht — ein vertauschtes oder umgehängtes Geheimnis fällt beim Entschlüsseln
 * auf, statt still ein falsches Passwort an einen Broker zu schicken.
 *
 * KEIN LOGGING in dieser Klasse. Auch keine „hilfreichen" Fehlermeldungen mit
 * Wertanteilen: Die Fehlerpfade nennen den Feldnamen, nie den Inhalt.
 */
/** PostgreSQL-Fehlercode fuer eine verletzte CHECK-Bedingung. */
const PG_CHECK_VERLETZUNG = '23514';

interface PostgresFehler {
  readonly code?: string;
  readonly constraint?: string;
}

function alsPostgresFehler(error: unknown): PostgresFehler | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const kandidat = error as { code?: unknown; constraint?: unknown };
  if (typeof kandidat.code !== 'string') {
    return undefined;
  }
  return {
    code: kandidat.code,
    ...(typeof kandidat.constraint === 'string' ? { constraint: kandidat.constraint } : {}),
  };
}

/**
 * Uebersetzt die CHECK-Bedingungen aus V0059 in Antworten, mit denen jemand
 * etwas anfangen kann.
 *
 * **Warum das nicht optional ist.** Ohne die Uebersetzung kam die Verletzung
 * als nacktes 500 beim Aufrufer an — beobachtet 2026-09-08 beim Anlegen einer
 * mTLS-Quelle ohne Zertifikat. Die Datenbank hatte richtig entschieden, aber
 * die Oberflaeche konnte nur „unerwarteter Fehler" sagen, und der Nutzer
 * haette geraten, woran es liegt.
 */
function alsAntwort(error: unknown): never {
  const pgFehler = alsPostgresFehler(error);
  if (pgFehler?.code === PG_CHECK_VERLETZUNG) {
    switch (pgFehler.constraint) {
      case 'ck_quelle_mtls_vollstaendig':
        throw ungueltigeEingabe(
          'Bei TLS-Modus "mtls" muessen Client-Zertifikat UND privater Schluessel hinterlegt sein — sonst ' +
            'scheitert erst der Verbindungsaufbau, und zwar unbemerkt im Worker-Protokoll.',
        );
      case 'ck_quelle_broker_ohne_credentials':
        throw ungueltigeEingabe(
          'Die Broker-Adresse darf keine Zugangsdaten enthalten. Benutzername und Passwort gehoeren in die ' +
            'dafuer vorgesehenen Felder — dort werden sie verschluesselt abgelegt.',
        );
      case 'ck_quelle_passwort_braucht_benutzer':
        throw ungueltigeEingabe('Ein Passwort ohne Benutzername ist bei MQTT nicht verwendbar.');
      default:
        break;
    }
  }
  throw error;
}

@Injectable()
export class IngestQuelleService {
  constructor(
    private readonly quellen: IngestQuelleRepository,
    private readonly schluessel: IngestQuelleSchluesselRepository,
    private readonly fieldCipher: FieldCipherService,
    private readonly auditService: AuditService,
    @Inject(KEY_MANAGEMENT_PORT) private readonly keyManagementPort: KeyManagementPort,
  ) {}

  /**
   * Das eigene Ereignis fuer hinterlegte Geheimnisse (V0060).
   *
   * Es steht NEBEN `angelegt`/`geaendert`, die der Controller-Decorator
   * schreibt — nicht statt ihrer. Die Frage „wer hat wann welches Geheimnis
   * hinterlegt" soll ohne Auslegung der uebrigen Aenderungen beantwortbar
   * sein, und `geheimnis_felder` fuehrt dafuer ausschliesslich FELDNAMEN.
   *
   * Wird nur emittiert, wenn tatsaechlich ein Wert GESETZT wurde. Ein
   * Entfernen (Leerstring) ist eine Aenderung, kein Hinterlegen — es steht im
   * `geaendert`-Ereignis, dessen `geheimnis_felder` dann kuerzer ist.
   */
  private async protokolliereGeheimnisse(
    quelleCode: string,
    quelleId: string,
    tlsModus: TlsModus,
    gesetzteFelder: readonly GeheimnisFeld[],
    subject: SecurityContext,
    synthetic: boolean,
  ): Promise<void> {
    if (gesetzteFelder.length === 0) {
      return;
    }
    await this.auditService.append({
      eventTyp: STAMMDATEN_EVENT_CODES.INGEST_QUELLE_ZUGANGSDATEN_HINTERLEGT,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: quelleId,
      kontext: {
        synthetic,
        quelle_code: quelleCode,
        tls_modus: tlsModus,
        geheimnis_felder: gesetzteFelder.join(','),
      },
    });
  }

  async liste(): Promise<readonly IngestQuelleItem[]> {
    return (await this.quellen.findAll()).map(alsItem);
  }

  async finden(id: string): Promise<IngestQuelleItem> {
    const quelle = await this.quellen.findById(id);
    if (quelle === undefined) {
      throw nichtGefunden('Datenquelle');
    }
    return alsItem(quelle);
  }

  /**
   * `Propagation.Nested`: Schlägt das Anlegen fehl (etwa am UNIQUE auf
   * `quelle_code`), rollt der SAVEPOINT zurück — die äußere Transaktion, die
   * das Audit-Ereignis trägt, überlebt und liefert eine saubere 409 statt
   * einer 500 (ADR-0002 §18).
   */
  @Transactional(Propagation.Nested)
  async anlegen(dto: QuelleAnlegenDto, subject: SecurityContext, synthetic: boolean): Promise<IngestQuelleItem> {
    const vorhanden = await this.quellen.findByCode(dto.quelleCode);
    if (vorhanden !== undefined) {
      throw konflikt(
        `Es gibt bereits eine Datenquelle mit der Kennung "${dto.quelleCode}". Die Kennung ist der Schluessel, ` +
          'ueber den ein Worker seine Konfiguration laedt — sie muss eindeutig bleiben.',
      );
    }

    // Vorab, VOR dem KMS-Roundtrip: Eine unvollstaendige mTLS-Konfiguration
    // faengt zwar auch der DB-CHECK ab, aber erst nach dem Erzeugen eines
    // Schluessels, den dann niemand mehr braucht.
    if (dto.tlsModus === 'mtls' && (isLeer(dto.clientZertifikat) || isLeer(dto.clientSchluessel))) {
      throw ungueltigeEingabe(
        'Bei TLS-Modus "mtls" muessen Client-Zertifikat UND privater Schluessel hinterlegt sein — sonst ' +
          'scheitert erst der Verbindungsaufbau, und zwar unbemerkt im Worker-Protokoll.',
      );
    }

    pruefeZertifikateNichtAbgelaufen({
      caZertifikat: dto.caZertifikat,
      clientZertifikat: dto.clientZertifikat,
    });

    const quelleId = randomUUID();
    const erzeugt = await this.keyManagementPort.generateDataKey();
    const schluesselId = randomUUID();
    await this.schluessel.insert({
      id: schluesselId,
      wrappedDek: erzeugt.wrappedDek,
      kmsKeyId: erzeugt.kmsKeyId,
      algVersion: erzeugt.algVersion,
    });

    const chiffriere = (feld: GeheimnisFeld, wert: string | undefined): Buffer | null =>
      wert === undefined || wert.length === 0 ? null : this.fieldCipher.encrypt(erzeugt.dek, quelleId, feld, wert);

    const angelegt = await this.quellen.insert({
      id: quelleId,
      quelleCode: dto.quelleCode,
      bezeichnung: dto.bezeichnung,
      brokerHost: dto.brokerHost,
      topic: dto.topic,
      clientId: dto.clientId,
      tlsModus: dto.tlsModus,
      cryptoKeyId: schluesselId,
      benutzernameEnc: chiffriere('benutzername', dto.benutzername),
      passwortEnc: chiffriere('passwort', dto.passwort),
      clientSchluesselEnc: chiffriere('client_schluessel', dto.clientSchluessel),
      caZertifikatEnc: chiffriere('ca_zertifikat', dto.caZertifikat),
      clientZertifikatEnc: chiffriere('client_zertifikat', dto.clientZertifikat),
      caZertifikatGueltigBis: dto.caZertifikat !== undefined ? (leseGueltigBis(dto.caZertifikat) ?? null) : null,
      clientZertifikatGueltigBis:
        dto.clientZertifikat !== undefined ? (leseGueltigBis(dto.clientZertifikat) ?? null) : null,
      notiz: dto.notiz ?? null,
    }).catch(alsAntwort);

    await this.protokolliereGeheimnisse(
      angelegt.quelleCode,
      angelegt.id,
      angelegt.tlsModus,
      hinterlegteGeheimnisse(angelegt),
      subject,
      synthetic,
    );

    return alsItem(angelegt);
  }

  @Transactional(Propagation.Nested)
  async aendern(
    id: string,
    dto: QuelleAendernDto,
    subject: SecurityContext,
    synthetic: boolean,
  ): Promise<IngestQuelleItem> {
    const quelle = await this.quellen.findById(id);
    if (quelle === undefined) {
      throw nichtGefunden('Datenquelle');
    }

    pruefeZertifikateNichtAbgelaufen({
      caZertifikat: dto.caZertifikat,
      clientZertifikat: dto.clientZertifikat,
    });

    // Der DEK wird NUR entpackt, wenn tatsächlich ein Geheimnis geschrieben
    // wird — ein Umbenennen soll keinen KMS-Roundtrip auslösen.
    const geheimnisFelder: { readonly feld: GeheimnisFeld; readonly wert: string | undefined }[] = [
      { feld: 'benutzername', wert: dto.benutzername },
      { feld: 'passwort', wert: dto.passwort },
      { feld: 'ca_zertifikat', wert: dto.caZertifikat },
      { feld: 'client_zertifikat', wert: dto.clientZertifikat },
      { feld: 'client_schluessel', wert: dto.clientSchluessel },
    ];
    const zuSetzen = geheimnisFelder.filter((eintrag) => eintrag.wert !== undefined);

    let chiffrate: Partial<Record<GeheimnisFeld, Buffer | null>> = {};
    if (zuSetzen.length > 0) {
      const schluessel = await this.schluessel.findById(quelle.cryptoKeyId);
      if (schluessel === undefined) {
        throw konflikt(
          'Zu dieser Datenquelle existiert kein Schluessel mehr — hinterlegte Zugangsdaten sind nicht mehr ' +
            'les- oder ersetzbar. Die Quelle muss neu angelegt werden.',
        );
      }
      const dek = await this.keyManagementPort.unwrapDek({
        wrappedDek: schluessel.wrappedDek,
        kmsKeyId: schluessel.kmsKeyId,
        algVersion: schluessel.algVersion,
      });
      chiffrate = Object.fromEntries(
        zuSetzen.map(({ feld, wert }) => [
          feld,
          // Leerstring = „entfernen". Das ist die einzige Art, ein einmal
          // hinterlegtes Geheimnis wieder loszuwerden, ohne die Quelle
          // neu anzulegen.
          wert !== undefined && wert.length > 0 ? this.fieldCipher.encrypt(dek, quelle.id, feld, wert) : null,
        ]),
      );
    }

    const aktualisiert = await this.quellen.update(id, {
      ...(dto.bezeichnung !== undefined ? { bezeichnung: dto.bezeichnung } : {}),
      ...(dto.brokerHost !== undefined ? { brokerHost: dto.brokerHost } : {}),
      ...(dto.topic !== undefined ? { topic: dto.topic } : {}),
      ...(dto.clientId !== undefined ? { clientId: dto.clientId } : {}),
      ...(dto.tlsModus !== undefined ? { tlsModus: dto.tlsModus } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.notiz !== undefined ? { notiz: dto.notiz.length === 0 ? null : dto.notiz } : {}),
      ...('benutzername' in chiffrate ? { benutzernameEnc: chiffrate.benutzername ?? null } : {}),
      ...('passwort' in chiffrate ? { passwortEnc: chiffrate.passwort ?? null } : {}),
      ...('ca_zertifikat' in chiffrate ? { caZertifikatEnc: chiffrate.ca_zertifikat ?? null } : {}),
      ...('client_zertifikat' in chiffrate ? { clientZertifikatEnc: chiffrate.client_zertifikat ?? null } : {}),
      ...('client_schluessel' in chiffrate ? { clientSchluesselEnc: chiffrate.client_schluessel ?? null } : {}),
      // Die Gueltigkeit wandert IMMER mit dem Zertifikat: Wird eines ersetzt,
      // gilt das neue Datum; wird eines entfernt (Leerstring), verschwindet
      // auch das Datum. Ein Ablaufdatum ohne Zertifikat waere eine Aussage
      // ueber nichts — die Datenbank lehnt es zusaetzlich ab (V0061).
      ...(dto.caZertifikat !== undefined
        ? { caZertifikatGueltigBis: dto.caZertifikat.length > 0 ? (leseGueltigBis(dto.caZertifikat) ?? null) : null }
        : {}),
      ...(dto.clientZertifikat !== undefined
        ? {
            clientZertifikatGueltigBis:
              dto.clientZertifikat.length > 0 ? (leseGueltigBis(dto.clientZertifikat) ?? null) : null,
          }
        : {}),
    }).catch(alsAntwort);

    if (aktualisiert === undefined) {
      throw nichtGefunden('Datenquelle');
    }

    // NUR die tatsaechlich GESETZTEN Felder — ein Entfernen (Leerstring) ist
    // kein Hinterlegen und gehoert ins `geaendert`-Ereignis.
    const gesetzt = zuSetzen
      .filter((eintrag) => eintrag.wert !== undefined && eintrag.wert.length > 0)
      .map((eintrag) => eintrag.feld);
    await this.protokolliereGeheimnisse(
      aktualisiert.quelleCode,
      aktualisiert.id,
      aktualisiert.tlsModus,
      gesetzt,
      subject,
      synthetic,
    );

    return alsItem(aktualisiert);
  }
}

/**
 * Weist ein bereits abgelaufenes Zertifikat zurueck.
 *
 * **Warum das eine Eingabepruefung ist und keine Warnung.** Beim Erneuern
 * versehentlich das ALTE Zertifikat zu kopieren ist der haeufigste Fehler an
 * dieser Stelle. Es anzunehmen hiesse, eine Verbindung zu konfigurieren, die
 * sicher nicht zustande kommt — und der Grund stuende nur im
 * Worker-Protokoll, wo ihn niemand sucht, solange die Oberflaeche
 * „gespeichert" gemeldet hat.
 */
function pruefeZertifikateNichtAbgelaufen(zertifikate: {
  readonly caZertifikat: string | undefined;
  readonly clientZertifikat: string | undefined;
}): void {
  const felder: readonly { readonly name: string; readonly pem: string | undefined }[] = [
    { name: 'caZertifikat', pem: zertifikate.caZertifikat },
    { name: 'clientZertifikat', pem: zertifikate.clientZertifikat },
  ];
  for (const feld of felder) {
    if (feld.pem !== undefined && feld.pem.length > 0 && istAbgelaufen(feld.pem)) {
      throw ungueltigeEingabe(
        `${feld.name}: Das Zertifikat ist bereits abgelaufen (gueltig bis ${String(leseGueltigBis(feld.pem))}). ` +
          'Eine Verbindung damit kommt nicht zustande — pruefen Sie, ob versehentlich das alte Zertifikat ' +
          'eingefuegt wurde.',
      );
    }
  }
}

function isLeer(wert: string | undefined): boolean {
  return wert === undefined || wert.length === 0;
}

/** Welche Geheimnis-Felder belegt sind — Namen, nie Werte. */
export function hinterlegteGeheimnisse(quelle: IngestQuelle): readonly GeheimnisFeld[] {
  const belegt: Record<GeheimnisFeld, Buffer | null> = {
    benutzername: quelle.benutzernameEnc,
    passwort: quelle.passwortEnc,
    ca_zertifikat: quelle.caZertifikatEnc,
    client_zertifikat: quelle.clientZertifikatEnc,
    client_schluessel: quelle.clientSchluesselEnc,
  };
  return GEHEIMNIS_FELDER.filter((feld) => belegt[feld] !== null);
}

/**
 * Die einzige Stelle, an der aus einer Zeile eine API-Antwort wird — und
 * damit die Stelle, an der die Chiffrate hängen bleiben. Sie zählt die Felder
 * einzeln auf, statt zu spreaden: Ein `...quelle` würde bei jeder neuen
 * Geheimnis-Spalte stillschweigend mehr ausgeben.
 */
function alsItem(quelle: IngestQuelle): IngestQuelleItem {
  return {
    id: quelle.id,
    quelleCode: quelle.quelleCode,
    bezeichnung: quelle.bezeichnung,
    brokerHost: quelle.brokerHost,
    topic: quelle.topic,
    clientId: quelle.clientId,
    tlsModus: quelle.tlsModus,
    status: quelle.status,
    notiz: quelle.notiz,
    hinterlegteGeheimnisse: hinterlegteGeheimnisse(quelle),
    caZertifikatGueltigBis: quelle.caZertifikatGueltigBis,
    clientZertifikatGueltigBis: quelle.clientZertifikatGueltigBis,
    createdAt: quelle.createdAt,
    updatedAt: quelle.updatedAt,
  };
}
