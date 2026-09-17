import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import type { SecurityContext } from '../../common/security/security-context';
import { nichtGefunden } from '../../stammdaten/common/problem.util';
import { AuditService } from '../../audit/audit.service';
import { NACHWEIS_EVENT_CODES, NACHWEIS_FEHLER_CODES } from '../audit/nachweis-audit-events';
import { NachweisFehlerException } from '../nachweis-fehler.exception';
import { NachweisFoerderjahrRepository } from '../persistence/nachweis-foerderjahr.repository';
import { NachweisPreflightRepository } from '../persistence/nachweis-preflight.repository';
import { NachweisEinsparlaufRepository } from '../persistence/nachweis-einsparlauf.repository';
import type { Einsparlauf } from '../persistence/nachweis-einsparlauf.repository';
import { AnalyticsVerfahrenRepository } from '../../berechnung/persistence/analytics-verfahren.repository';
import { AnalyticsExportLaufRepository } from '../persistence/analytics-export-lauf.repository';
import { NachweisExportPseudonymRepository } from '../persistence/nachweis-export-pseudonym.repository';
import { NachweisExportRepository } from '../persistence/nachweis-export.repository';
import type { ExportStationDarstellung, ExportZweck, NachweisExport, NachweisExportDatei } from '../persistence/nachweis-export.repository';
import { berechneEinreichungDifferenz } from '../domain/einreichung-differenz';
import type { DifferenzZeile } from '../domain/einreichung-differenz';
import { waehleRenderer } from './nachweis-export-renderer';
import type {
  ExportRenderErgebnis,
  ExportRenderHeader,
  ExportRenderInput,
  RenderGeraeteGruppe,
  RenderGeraeteQuote,
  RenderNachweisMesspunkt,
  RenderNachweisSystem,
  RenderRohdatenMesswertTag,
} from './nachweis-export-renderer';
import { KETTE_NICHT_AUFLOESBAR_REGEL_CODE } from '../verfahren.const';
import {
  EXPORT_SCHEMA_CODE,
  EXPORT_SCHEMA_VERSION_V3,
  EXPORT_SCHEMA_VERSION_V5,
} from './nachweis-export-spaltenprofil.const';
import { GeraeteerkennungRepository } from '../../geraeteerkennung/persistence/geraeteerkennung.repository';
import { sollQuotePct } from '../../geraeteerkennung/geraeteerkennung.service';
import { mapNachweisExportAntwort } from './nachweis-export.types';
import type { NachweisExportAntwort } from './nachweis-export.types';
import type { NachweisExportErzeugenDto } from '../dto/nachweis-export-erzeugen.dto';

/** Erster des Folgemonats — die obere, AUSSCHLIESSENDE Fenstergrenze. */
function monatDanach(monatIso: string): string {
  const [jahr, monat] = monatIso.split('-');
  const datum = new Date(Date.UTC(Number(jahr), Number(monat), 1));
  return `${String(datum.getUTCFullYear())}-${String(datum.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

interface RenderEingang {
  readonly renderInput: ExportRenderInput;
  readonly zeilenAnzahlGesamt: number;
}

/**
 * `POST /nachweis/einsparlaeufe/{id}/exporte` (`create:nachweis_export`) +
 * `GET /nachweis/exporte/{id}`/`GET .../dateien/{dateiname}`
 * (`read:nachweis_export`) — ADR-0007 D5/D6/B10, Teil C A13/A14/A15/A19/A20/A23.
 *
 * **Determinismus (Kernanforderung):** `sammleRenderEingang()` beschafft
 * ALLE Eingangsdaten für den versionsrichtigen Renderer (`waehleRenderer`) — für (a) die
 * ERST-ERZEUGUNG (`pseudonymeSchreibend=true`, `header` wird über
 * `baueHeader()` NEU vergeben, inkl. eines frischen `erzeugtAtUtc`) UND (b)
 * die DOWNLOAD-VERIFIKATION (`pseudonymeSchreibend=false`, `header` wird
 * über `baueHeader()` aus dem PERSISTIERTEN `nachweis.export`-Datensatz
 * REKONSTRUIERT, inkl. desselben `erzeugtAtUtc`) — beide Pfade rufen DANACH
 * denselben Renderer mit STRUKTURELL identischen Eingaben auf:
 * derselbe Lauf ⇒ derselbe Hash.
 */
@Injectable()
export class NachweisExportService {
  constructor(
    private readonly foerderjahrRepository: NachweisFoerderjahrRepository,
    private readonly preflightRepository: NachweisPreflightRepository,
    private readonly einsparlaufRepository: NachweisEinsparlaufRepository,
    private readonly verfahrenRepository: AnalyticsVerfahrenRepository,
    private readonly analyticsExportLaufRepository: AnalyticsExportLaufRepository,
    private readonly pseudonymRepository: NachweisExportPseudonymRepository,
    private readonly exportRepository: NachweisExportRepository,
    // TB-05: DIESELBE Quote, die Betrieb und Kundendokument sehen. Eine
    // zweite Abfrage im Exportpfad waere die zweite Wahrheit, und die Stelle,
    // an der sie abweicht, waere ausgerechnet der Nachweis an die Behoerde.
    private readonly geraeteerkennungRepository: GeraeteerkennungRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * `synthetic` im Audit-Kontext wird — ANDERS als bei `create:foerderjahr`/
   * `create:nachweis_preflight`/`create:einsparlauf` — NICHT vom
   * `SyntheticOnlyInterceptor` (der greift nur auf Routen, die NEUE
   * `analytics`/`nachweis`-Läufe erzeugen) übernommen, sondern direkt vom
   * gebundenen `einsparlauf.synthetic` GEERBT: ein Export IST eine
   * Repackaging-Operation auf bereits gefrorenen, bereits gate-geprüften
   * Daten — er kann nicht "weniger synthetisch" sein als sein Ursprungslauf
   * (Konsistenz-Argument, keine zweite, potenziell abweichende
   * Gate-Entscheidung an dieser Stelle).
   */
  async erzeugen(einsparlaufId: string, dto: NachweisExportErzeugenDto, subject: SecurityContext): Promise<NachweisExportAntwort> {
    const zweck: ExportZweck = dto.zweck ?? 'nachweis';
    const stationDarstellung: ExportStationDarstellung = dto.stationDarstellung ?? 'pseudonymisiert';
    const anfrageRef = dto.anfrageRef ?? null;

    // A23 — fail-closed, VOR jedem Schreibzugriff (Empfaenger/Rolle/Rechtsgrundlage ungeklaert, DB-CHECK ist der Backstop).
    if (zweck === 'wissenschaftliche_auswertung') {
      throw new NachweisFehlerException(
        NACHWEIS_FEHLER_CODES.WISS_AUSWERTUNG_GESPERRT,
        HttpStatus.FORBIDDEN,
        `zweck='wissenschaftliche_auswertung' ist fail-closed gesperrt (Auflage A23) — Empfaenger/Rolle/Rechtsgrundlage sind ungeklaert.`,
      );
    }
    // A13 — fail-closed (App-Backstop, DB-CHECK ck_export_station_klarname_anfrage ist die zweite Verteidigungslinie).
    if (stationDarstellung === 'klarname' && (anfrageRef === null || anfrageRef.trim().length === 0)) {
      throw new NachweisFehlerException(
        NACHWEIS_FEHLER_CODES.KLARNAME_OHNE_ANFRAGE_REF,
        HttpStatus.BAD_REQUEST,
        `stationDarstellung='klarname' verlangt eine aktenkundige anfrageRef (Auflage A13).`,
      );
    }

    const einsparlauf = await this.einsparlaufRepository.findById(einsparlaufId);
    if (einsparlauf === undefined) {
      throw new NachweisFehlerException(NACHWEIS_FEHLER_CODES.EINSPARLAUF_NICHT_GEFUNDEN, HttpStatus.NOT_FOUND, `Einsparlauf ${einsparlaufId} wurde nicht gefunden.`);
    }
    const schema = await this.verfahrenRepository.findAktiveVersion(EXPORT_SCHEMA_CODE);
    // Neue Exporte entstehen IMMER unter der aktiven Katalog-Version; die ist
    // seit V0075 die 3. Altexporte behalten ihre gespeicherte Version und
    // rendern beim Download weiter darunter (s. `waehleRenderer`).
    if (schema === undefined || schema.version !== EXPORT_SCHEMA_VERSION_V5) {
      throw new Error(`Kein aktives Verfahren '${EXPORT_SCHEMA_CODE}'@${String(EXPORT_SCHEMA_VERSION_V5)} im Katalog (analytics.verfahren_version).`);
    }

    const header = await this.baueHeader({
      exportId: randomUUID(),
      einsparlauf,
      schemaCode: schema.code,
      schemaVersion: schema.version,
      zweck,
      stationDarstellung,
      anfrageRef,
      erzeugtAtUtc: new Date().toISOString(),
    });

    const eingang = await this.sammleRenderEingang(header, einsparlauf, { pseudonymeSchreibend: true });
    const ergebnis = waehleRenderer(header.schemaVersion)(eingang.renderInput);

    const gespeichert = await this.persistiere(header, ergebnis, subject.sub, eingang.zeilenAnzahlGesamt);

    await this.auditService.append({
      eventTyp: NACHWEIS_EVENT_CODES.EXPORT_ERZEUGT,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: gespeichert.exportRow.id,
      kontext: {
        synthetic: einsparlauf.synthetic,
        export_id: gespeichert.exportRow.id,
        einsparlauf_id: einsparlaufId,
        foerderjahr_code: header.foerderjahrCode,
        schema_code: schema.code,
        schema_version: schema.version,
        format: gespeichert.exportRow.format,
        zweck,
        pseudonym_profil: gespeichert.exportRow.pseudonymProfil,
        // NIEMALS `null` als Kontext-Wert (V0003 `audit.event_seal()`-Trigger,
        // Schritt (3): "kontext-Wert nicht skalar" -- `jsonb_typeof(null)` ist
        // 'null', KEIN erlaubter Skalartyp. Nullable Felder werden daher bei
        // Abwesenheit AUSGELASSEN statt als `null` mitgegeben -- Muster
        // `EinsparlaufService`s bedingtes Spreading fuer optionale Kontext-Felder.
        ...(anfrageRef !== null ? { anfrage_ref: anfrageRef } : {}),
        station_darstellung: stationDarstellung,
        de04_auszug: gespeichert.exportRow.de04Auszug,
        dateien_anzahl: gespeichert.exportRow.dateienAnzahl,
        zeilen_anzahl_gesamt: gespeichert.exportRow.zeilenAnzahlGesamt,
        manifest_hash: gespeichert.exportRow.manifestHash.toString('hex'),
      },
    });

    return mapNachweisExportAntwort(gespeichert.exportRow, gespeichert.dateien);
  }

  async finden(exportId: string): Promise<NachweisExportAntwort> {
    const exportRow = await this.exportRepository.findById(exportId);
    if (exportRow === undefined) {
      throw nichtGefunden('Export');
    }
    const dateien = await this.exportRepository.findDateienByExportId(exportId);
    return mapNachweisExportAntwort(exportRow, dateien);
  }

  /**
   * `GET /nachweis/exporte/{id}/dateien/{dateiname}` — rendert NEU und
   * VERIFIZIERT vor Auslieferung (D5/O-B10, A.8.24). Abweichung ⇒ KEINE
   * Auslieferung, Fehler, Audit-Event (`ergebnis='error'`).
   */
  async datei(exportId: string, dateiname: string, subject: SecurityContext): Promise<string | Buffer> {
    const exportRow = await this.exportRepository.findById(exportId);
    if (exportRow === undefined) {
      throw nichtGefunden('Export');
    }
    const persistierteDatei = await this.exportRepository.findDateiByName(exportId, dateiname);
    if (persistierteDatei === undefined) {
      throw new NachweisFehlerException(NACHWEIS_FEHLER_CODES.EXPORT_DATEI_NICHT_GEFUNDEN, HttpStatus.NOT_FOUND, `Datei '${dateiname}' ist nicht Teil des Exports ${exportId}.`);
    }
    const einsparlauf = await this.einsparlaufRepository.findById(exportRow.einsparlaufId);
    if (einsparlauf === undefined) {
      throw nichtGefunden('Einsparlauf');
    }

    // `synthetic` GEERBT vom gebundenen Einsparlauf — s. `erzeugen()`-Dok.
    // `anfrage_ref` NUR bei Vorhandensein (NIEMALS `null` als Kontext-Wert,
    // s. Kommentar in `erzeugen()`).
    const kontextBasis = {
      synthetic: einsparlauf.synthetic,
      export_id: exportRow.id,
      einsparlauf_id: exportRow.einsparlaufId,
      schema_code: exportRow.schemaCode,
      schema_version: exportRow.schemaVersion,
      format: exportRow.format,
      zweck: exportRow.zweck,
      pseudonym_profil: exportRow.pseudonymProfil,
      ...(exportRow.anfrageRef !== null ? { anfrage_ref: exportRow.anfrageRef } : {}),
      station_darstellung: exportRow.stationDarstellung,
      de04_auszug: exportRow.de04Auszug,
      dateien_anzahl: exportRow.dateienAnzahl,
      zeilen_anzahl_gesamt: exportRow.zeilenAnzahlGesamt,
      manifest_hash: exportRow.manifestHash.toString('hex'),
      dateiname,
    };

    let ergebnis: ExportRenderErgebnis;
    try {
      const header = await this.baueHeader({
        exportId: exportRow.id,
        einsparlauf,
        schemaCode: exportRow.schemaCode,
        schemaVersion: exportRow.schemaVersion,
        zweck: exportRow.zweck,
        stationDarstellung: exportRow.stationDarstellung,
        anfrageRef: exportRow.anfrageRef,
        erzeugtAtUtc: exportRow.erzeugtAt,
      });
      const eingang = await this.sammleRenderEingang(header, einsparlauf, { pseudonymeSchreibend: false });
      // Die GESPEICHERTE Version des Exports, nicht die aktive: Ein Export
      // aus der Zeit vor V0064 muss weiter so rendern, wie er eingereicht
      // wurde — sonst „driftet" er an der Hash-Pruefung, obwohl an ihm nichts
      // falsch ist.
      ergebnis = waehleRenderer(exportRow.schemaVersion)(eingang.renderInput);
    } catch (error: unknown) {
      // `fehler_code` ist NICHT Teil der `export.nachweis.abgerufen`-Whitelist
      // (V0026/B10, wörtlich geprüft) — ANDERS als bei den `einsparlauf.
      // nachweis.*`-Codes gibt es hier keinen Kontext-Platz dafür; `ergebnis
      // ='error'` allein trägt das Fehlschlag-Signal (die Fehlerursache
      // bleibt im (unauditierten) HTTP-Response/Server-Log, NICHT im
      // Audit-Kontext).
      await this.auditService.append({
        eventTyp: NACHWEIS_EVENT_CODES.EXPORT_ABGERUFEN,
        actorTyp: subject.actorTyp,
        actorSub: subject.sub,
        ergebnis: 'error',
        objektRef: exportRow.id,
        kontext: kontextBasis,
      });
      throw error;
    }

    const gefunden = ergebnis.dateien.find((d) => d.dateiname === dateiname);
    const hashStimmtUeberein = gefunden !== undefined && gefunden.hash.equals(persistierteDatei.dateiHash);
    const manifestStimmtUeberein = ergebnis.manifestHash.equals(exportRow.manifestHash);

    if (!hashStimmtUeberein || !manifestStimmtUeberein) {
      await this.auditService.append({
        eventTyp: NACHWEIS_EVENT_CODES.EXPORT_ABGERUFEN,
        actorTyp: subject.actorTyp,
        actorSub: subject.sub,
        ergebnis: 'error',
        objektRef: exportRow.id,
        kontext: kontextBasis,
      });
      throw new NachweisFehlerException(
        NACHWEIS_FEHLER_CODES.HASH_ABWEICHUNG,
        HttpStatus.INTERNAL_SERVER_ERROR,
        `Der neu gerenderte Inhalt von '${dateiname}' weicht vom persistierten Hash ab — Auslieferung verweigert (A.8.24).`,
      );
    }

    await this.auditService.append({
      eventTyp: NACHWEIS_EVENT_CODES.EXPORT_ABGERUFEN,
      actorTyp: subject.actorTyp,
      actorSub: subject.sub,
      ergebnis: 'ok',
      objektRef: exportRow.id,
      kontext: kontextBasis,
    });

    // `gefunden` ist an dieser Stelle strukturell definiert (`hashStimmtUeberein` impliziert es, s. o.).
    if (gefunden === undefined) {
      throw new Error('Struktureller Fehler: gefunden ist undefined trotz hashStimmtUeberein=true.');
    }
    return gefunden.inhalt;
  }

  /**
   * Baut den unveraenderlichen Render-Header. Wird ZWEIMAL verwendet: bei
   * der Erst-Erzeugung (frische `exportId`/`erzeugtAtUtc`) und bei der
   * Download-Verifikation (beide Werte aus dem persistierten
   * `nachweis.export`-Datensatz uebernommen) — s. Klassen-Dok.
   */
  private async baueHeader(input: {
    readonly exportId: string;
    readonly einsparlauf: Einsparlauf;
    readonly schemaCode: string;
    readonly schemaVersion: number;
    readonly zweck: ExportZweck;
    readonly stationDarstellung: ExportStationDarstellung;
    readonly anfrageRef: string | null;
    readonly erzeugtAtUtc: string;
  }): Promise<ExportRenderHeader> {
    const foerderjahr = await this.foerderjahrRepository.findById(input.einsparlauf.foerderjahrId);
    if (foerderjahr === undefined) {
      throw nichtGefunden('Foerderjahr');
    }
    const preflight = await this.preflightRepository.findById(input.einsparlauf.preflightId);
    if (preflight === undefined) {
      throw nichtGefunden('Preflight');
    }
    const befunde = await this.preflightRepository.findBefunde(preflight.id, { limit: 1000 });
    const regelCodes = [...new Set(befunde.daten.map((b) => b.regelCode))].sort();

    return {
      exportId: input.exportId,
      einsparlaufId: input.einsparlauf.id,
      ersetztEinsparlaufId: input.einsparlauf.ersetztEinsparlaufId,
      foerderjahrCode: foerderjahr.code,
      foerderjahrNummer: foerderjahr.nummer,
      foerderjahrVonMonat: foerderjahr.vonMonat,
      foerderjahrBisMonat: foerderjahr.bisMonat,
      foerderjahrDefinitionQuelle: foerderjahr.definitionQuelle,
      einsparlaufArt: input.einsparlauf.art,
      verfahrenCode: input.einsparlauf.verfahrenCode,
      verfahrenVersion: input.einsparlauf.verfahrenVersion,
      parameter: input.einsparlauf.parameter,
      bindungsHashHex: input.einsparlauf.bindungsHash.toString('hex'),
      umfangPaareAnzahl: input.einsparlauf.umfangPaareAnzahl,
      monateErwartet: input.einsparlauf.monateErwartet,
      monateGebunden: input.einsparlauf.monateGebunden,
      gebundeneLaeufeAnzahl: input.einsparlauf.gebundeneLaeufeAnzahl,
      qualitaetsStufeMin: input.einsparlauf.qualitaetsStufeMin,
      preflightId: preflight.id,
      preflightProfilCode: preflight.profilCode,
      preflightProfilVersion: preflight.profilVersion,
      preflightErgebnis: preflight.ergebnis,
      preflightBlockerAnzahl: preflight.blockerAnzahl,
      preflightWarnungAnzahl: preflight.warnungAnzahl,
      preflightHinweisAnzahl: preflight.hinweisAnzahl,
      preflightRegelCodes: regelCodes,
      schemaCode: input.schemaCode,
      schemaVersion: input.schemaVersion,
      pseudonymProfil: 'standard',
      stationDarstellung: input.stationDarstellung,
      zweck: input.zweck,
      anfrageRef: input.anfrageRef,
      erzeugtAtUtc: input.erzeugtAtUtc,
      codeRevision: process.env['EDMS_CODE_REVISION'] ?? 'dev-unbekannt',
    };
  }

  /**
   * ALLE für den Renderer benötigten Eingangsdaten (D5/B6/B7/A20/TB-05).
   * `optionen.pseudonymeSchreibend`: `true` NUR bei der Erst-Erzeugung
   * (Vergabe neuer `EK-`/`ST-`-Pseudonyme, D6), `false` bei der
   * Download-Verifikation (rein lesend — ein GET darf NICHTS allozieren).
   */
  @Transactional(Propagation.Nested)
  private async sammleRenderEingang(header: ExportRenderHeader, einsparlauf: Einsparlauf, optionen: { readonly pseudonymeSchreibend: boolean }): Promise<RenderEingang> {
    const bindungenSeite = await this.einsparlaufRepository.findBindungenByLaufId(header.einsparlaufId, { limit: 10_000 });
    const ergebnisseSeite = await this.einsparlaufRepository.findErgebnisseByLaufId(header.einsparlaufId, { limit: 10_000 });
    const berechnungslaufIds = [...new Set(bindungenSeite.daten.map((b) => b.berechnungslaufId))];
    const berechnungslaeufe = await this.analyticsExportLaufRepository.findBerechnungslaeufeByIds(berechnungslaufIds);
    const klimaSnapshotIds = [...new Set(berechnungslaeufe.map((b) => b.klimaSnapshotId))];
    const klimaTage = await this.analyticsExportLaufRepository.findKlimaTageBySnapshotIds(klimaSnapshotIds);
    const dwdAttributionErforderlich = await this.analyticsExportLaufRepository.hatNichtSynthetischeKlimaquelle(klimaSnapshotIds);

    // A12 — `rohdatenErlaubt` ist EIN Wert, EINDEUTIG aus `header.
    // preflightRegelCodes` ableitbar (identische Prüfung wie
    // `nachweis-export-renderer.ts`s `rohdatenErlaubt()` — hier NUR benutzt,
    // um die (potenziell teure) Messwert-Query + Pseudonym-Vergabe zu
    // GATEN, NICHT um eine zweite, abweichende Entscheidung zu treffen: die
    // eigentliche Aufnahme-Entscheidung bleibt EINZIG beim Renderer).
    const rohdatenErlaubt = !header.preflightRegelCodes.includes(KETTE_NICHT_AUFLOESBAR_REGEL_CODE);
    const messwertSnapshotIds = [...new Set(berechnungslaeufe.map((b) => b.messwertSnapshotId))];
    const messwertTageRoh = rohdatenErlaubt ? await this.analyticsExportLaufRepository.findMesswertTageBySnapshotIds(messwertSnapshotIds) : [];

    let differenzZeilen: readonly DifferenzZeile[] | null = null;
    if (einsparlauf.ersetztEinsparlaufId !== null) {
      const altSeite = await this.einsparlaufRepository.findErgebnisseByLaufId(einsparlauf.ersetztEinsparlaufId, { limit: 10_000 });
      differenzZeilen = berechneEinreichungDifferenz(
        altSeite.daten.map((e) => ({ endkundeId: e.endkundeId, energietraeger: e.energietraeger, einsparungKwhEndenergie: e.einsparungKwhEndenergie })),
        ergebnisseSeite.daten.map((e) => ({ endkundeId: e.endkundeId, energietraeger: e.energietraeger, einsparungKwhEndenergie: e.einsparungKwhEndenergie })),
      );
    }

    const endkundeIds = new Set<string>([
      ...bindungenSeite.daten.map((b) => b.endkundeId),
      ...ergebnisseSeite.daten.map((e) => e.endkundeId),
      ...berechnungslaeufe.map((b) => b.endkundeId),
      ...(differenzZeilen?.map((d) => d.endkundeId) ?? []),
    ]);
    const stationRefs = new Set<string>([...berechnungslaeufe.map((b) => b.stationRef), ...klimaTage.map((k) => k.stationRef)]);

    const endkundePseudonymMap = await this.aufloesenOderVergeben('endkunde', [...endkundeIds], optionen.pseudonymeSchreibend);
    const stationPseudonymMap =
      header.stationDarstellung === 'pseudonymisiert' ? await this.aufloesenOderVergeben('station', [...stationRefs], optionen.pseudonymeSchreibend) : new Map<string, string>();

    // A12 — `snapshotId -> (endkundeId, energietraeger)`-Aufloesung ueber die
    // BEREITS GELADENEN `berechnungslaeufe` (jeder Lauf traegt GENAU EIN
    // `messwertSnapshotId`, `NOT NULL`, s. `analytics-export-lauf.
    // repository.ts`-Kommentar). Content-Addressing dedupliziert je
    // `(endkunde_id, art, inhalt_hash)` (V0019) — ein geteilter Snapshot ist
    // damit IMMER demselben Endkunden zuordenbar; „erste Zuordnung gewinnt"
    // ist bei einer (extrem unwahrscheinlichen) geteilten mvet-Hash-Kollision
    // ueber ZWEI Energietraeger desselben Endkunden die einzig sinnvolle
    // Fallback-Regel (identisches Prinzip zu `EinflussgroesseExportZeile`).
    const snapshotZuordnung = new Map<string, { readonly endkundeId: string; readonly energietraeger: string }>();
    for (const b of berechnungslaeufe) {
      if (!snapshotZuordnung.has(b.messwertSnapshotId)) {
        snapshotZuordnung.set(b.messwertSnapshotId, { endkundeId: b.endkundeId, energietraeger: b.energietraeger });
      }
    }
    const rohdaten: RenderRohdatenMesswertTag[] = messwertTageRoh.map((m) => {
      const zuordnung = snapshotZuordnung.get(m.snapshotId);
      if (zuordnung === undefined) {
        throw new Error(`Kein Berechnungslauf fuer messwert_snapshot_id ${m.snapshotId} aufloesbar — struktureller Fehler.`);
      }
      return { endkundeId: zuordnung.endkundeId, energietraeger: zuordnung.energietraeger, messkanalKey: m.messkanalKey, tag: m.tag, wertKwh: m.wertKwh, qualitaetMin: m.qualitaetMin, anzahlMesswerte: m.anzahlMesswerte };
    });
    const messkanalRefs = new Set<string>(messwertTageRoh.map((m) => String(m.messkanalKey)));
    const messkanalPseudonymMap = rohdatenErlaubt ? await this.aufloesenOderVergeben('messkanal', [...messkanalRefs], optionen.pseudonymeSchreibend) : new Map<string, string>();

    const endkundePseudonym = (endkundeId: string): string => {
      const wert = endkundePseudonymMap.get(endkundeId);
      if (wert === undefined) {
        throw new Error(`Kein Export-Pseudonym fuer endkunde ${endkundeId} aufloesbar — struktureller Fehler (haette bei Erstellung vergeben werden muessen).`);
      }
      return wert;
    };
    const stationWert = (stationRef: string): string => {
      if (header.stationDarstellung === 'klarname') {
        return stationRef;
      }
      const wert = stationPseudonymMap.get(stationRef);
      if (wert === undefined) {
        throw new Error(`Kein Export-Pseudonym fuer station ${stationRef} aufloesbar — struktureller Fehler.`);
      }
      return wert;
    };
    // v1: `analytics.eingang_einflussgroesse` ist strukturell immer leer (s. Renderer-Kopfkommentar) — `systemPseudonym`
    // bleibt dennoch real implementiert (Identitaets-Fallback, KEIN totes Feld: bereit fuer den Tag, an dem der
    // Snapshot-Schreibpfad nachgezogen wird, OHNE dass diese Funktion nochmal angefasst werden muss).
    const systemPseudonymMap = new Map<string, string>();
    const systemPseudonym = (systemId: string): string => systemPseudonymMap.get(systemId) ?? systemId;
    const messkanalPseudonym = (messkanalKey: number): string => {
      const wert = messkanalPseudonymMap.get(String(messkanalKey));
      if (wert === undefined) {
        throw new Error(`Kein Export-Pseudonym fuer messkanal ${String(messkanalKey)} aufloesbar — struktureller Fehler.`);
      }
      return wert;
    };

    // --- TB-05: Geraeteerkennungs-Quote (Exportschema v2, V0064) ---
    //
    // Der Umfang sind GENAU die Paare des Einsparlaufs — dieselbe Menge, auf
    // die sich der Nachweis bezieht. Das Zeitfenster ist das Foerderjahr;
    // `bisMonat` ist der LETZTE Monat einschliesslich, das Tagesfenster endet
    // also am Ersten des Folgemonats.
    const quotenPaare = [...new Map(ergebnisseSeite.daten.map((e) => [`${e.endkundeId}|${e.energietraeger}`, { endkundeId: e.endkundeId, energietraeger: e.energietraeger }])).values()];
    const quotenVonTag = header.foerderjahrVonMonat;
    const quotenBisTag = monatDanach(header.foerderjahrBisMonat);
    const [verbrauchProPaar, gruppenRoh, systemeProEndkunde] = await Promise.all([
      this.geraeteerkennungRepository.summiereVerbrauchFuerPaare(quotenPaare, quotenVonTag, quotenBisTag),
      this.geraeteerkennungRepository.summiereJeGruppeUndMethodeFuerPaare(quotenPaare, quotenVonTag, quotenBisTag),
      this.geraeteerkennungRepository.zaehleSystemeFuerEndkunden([...new Set(quotenPaare.map((p) => p.endkundeId))]),
    ]);

    const systemeMap = new Map(systemeProEndkunde.map((s) => [s.endkundeId, s]));
    const verbrauchMap = new Map(verbrauchProPaar.map((v) => [`${v.endkundeId}|${v.energietraeger}`, v]));
    const sollPct = sollQuotePct(header.foerderjahrNummer);

    // JEDES Paar bekommt eine Zeile, auch ohne Tageswerte. Eine fehlende
    // Zeile waere von „nicht geprueft" nicht zu unterscheiden.
    const geraeteQuoten: RenderGeraeteQuote[] = quotenPaare.map((paar) => {
      const v = verbrauchMap.get(`${paar.endkundeId}|${paar.energietraeger}`);
      const systeme = systemeMap.get(paar.endkundeId);
      const gesamtKwh = v?.gesamtKwh ?? 0;
      const zugeordnetKwh = v?.zugeordnetKwh ?? 0;
      const ohneTageswerte = (v?.tageMitWerten ?? 0) === 0;
      // Eine Quote ohne Nenner ist unbekannt, nicht 0 — dieselbe Regel wie in
      // `GeraeteerkennungService.quote()`.
      const quotePct = ohneTageswerte || gesamtKwh <= 0 ? null : Math.round((zugeordnetKwh / gesamtKwh) * 10000) / 100;
      return {
        endkundeId: paar.endkundeId,
        energietraeger: paar.energietraeger,
        gesamtKwh,
        zugeordnetKwh,
        quotePct,
        sollQuotePct: sollPct,
        erreicht: quotePct === null ? null : quotePct >= sollPct,
        systemeGesamt: systeme?.gesamt ?? 0,
        systemeEntbehrlich: systeme?.entbehrlich ?? 0,
        ohneTageswerte,
      };
    });

    const geraeteGruppen: RenderGeraeteGruppe[] = gruppenRoh.map((g) => {
      const gesamtKwh = verbrauchMap.get(`${g.endkundeId}|${g.energietraeger}`)?.gesamtKwh ?? 0;
      return {
        endkundeId: g.endkundeId,
        energietraeger: g.energietraeger,
        geraetegruppeId: g.geraetegruppeId,
        bezeichnung: g.bezeichnung,
        methode: g.methode,
        zugeordnetKwh: g.zugeordnetKwh,
        // Bezugsgroesse ist der ERFASSTE Gesamtverbrauch, nicht der
        // zugeordnete — sonst summierten sich die Anteile immer auf 100 %,
        // auch wenn nur ein Zehntel ueberhaupt zugeordnet ist.
        anteilPct: gesamtKwh <= 0 ? 0 : Math.round((g.zugeordnetKwh / gesamtKwh) * 10000) / 100,
        genauigkeitPctMin: g.genauigkeitPctMin,
      };
    });

    // A13-Muster: Freitext-Bezeichnung nur bei aktenkundiger Anfrage, sonst
    // `GG-<lfd>` aus derselben Pseudonym-Tabelle wie Endkunde und Station.
    const geraetegruppeRefs = new Set<string>(geraeteGruppen.map((g) => g.geraetegruppeId));
    const geraetegruppePseudonymMap =
      header.stationDarstellung === 'pseudonymisiert'
        ? await this.aufloesenOderVergeben('geraetegruppe', [...geraetegruppeRefs], optionen.pseudonymeSchreibend)
        : new Map<string, string>();
    const geraetegruppeWert = (geraetegruppeId: string, bezeichnung: string): string => {
      if (header.stationDarstellung === 'klarname') {
        return bezeichnung;
      }
      const wert = geraetegruppePseudonymMap.get(geraetegruppeId);
      if (wert === undefined) {
        throw new Error(`Kein Export-Pseudonym fuer geraetegruppe ${geraetegruppeId} aufloesbar — struktureller Fehler.`);
      }
      return wert;
    };

    // Exportschema v3 (V0075) — die Stammdaten fuer die
    // Einsparungsnachweis-Mappe. Nur laden, wenn dieser Export sie auch
    // rendert: Eine Abfrage, deren Ergebnis nie verwendet wird, waere totes
    // Risiko-Gepaeck (dieselbe Linie wie bei der Rohdaten-Kategorie).
    const brauchtNachweisMappe = header.schemaVersion >= EXPORT_SCHEMA_VERSION_V3;
    const paare = berechnungslaeufe.map((lauf) => ({
      endkundeId: lauf.endkundeId,
      energietraeger: lauf.energietraeger,
    }));
    const stammdaten = brauchtNachweisMappe ? await this.analyticsExportLaufRepository.findNachweisStammdaten(paare) : [];
    const nachweisSysteme: RenderNachweisSystem[] = stammdaten.map((zeile) => ({
      endkundeId: zeile.endkundeId,
      energietraeger: zeile.energietraeger,
      endkundengruppe: zeile.endkundengruppe,
      standortId: zeile.standortId,
      baselineVersion: zeile.baselineVersion,
      bereinigungsverfahren: zeile.bereinigungsverfahren,
      messpunktAnzahl: zeile.messpunktAnzahl,
    }));

    // Die Richtungen NUR fuer die Kanaele, die im Buendel vorkommen.
    const kanalKeys = [...new Set(rohdaten.map((z) => z.messkanalKey))];
    const richtungen = brauchtNachweisMappe
      ? await this.analyticsExportLaufRepository.findMesskanalRichtungen(kanalKeys)
      : [];
    const richtungJeKanal = new Map(richtungen.map((r) => [r.messkanalKey, r.richtung]));
    const paarJeKanal = new Map(rohdaten.map((z) => [z.messkanalKey, z]));
    const nachweisMesspunkte: RenderNachweisMesspunkt[] = kanalKeys.flatMap((key) => {
      const zeile = paarJeKanal.get(key);
      const richtung = richtungJeKanal.get(key);
      if (zeile === undefined || richtung === undefined) {
        return [];
      }
      return [
        {
          endkundeId: zeile.endkundeId,
          energietraeger: zeile.energietraeger,
          messkanalKey: key,
          richtung: richtung === 'eigenerzeugung' || richtung === 'einspeisung' ? richtung : ('bezug' as const),
        },
      ];
    });

    const renderInput: ExportRenderInput = {
      header,
      berechnungslaeufe,
      klimaTage,
      einflussgroessen: [],
      rohdaten,
      bindungen: bindungenSeite.daten,
      ergebnisse: ergebnisseSeite.daten,
      differenzZeilen,
      dwdAttributionErforderlich,
      geraeteQuoten,
      geraeteGruppen,
      nachweisSysteme,
      nachweisMesspunkte,
      foerderjahr: {
        code: header.foerderjahrCode,
        nummer: header.foerderjahrNummer,
        vonMonat: header.foerderjahrVonMonat,
        bisMonat: header.foerderjahrBisMonat,
      },
      endkundePseudonym,
      systemPseudonym,
      messkanalPseudonym,
      stationWert,
      geraetegruppeWert,
    };

    const zeilenAnzahlGesamt =
      rohdaten.length +
      bindungenSeite.daten.length +
      ergebnisseSeite.daten.length +
      berechnungslaeufe.length +
      klimaTage.length +
      (differenzZeilen?.length ?? 0) +
      geraeteQuoten.length +
      geraeteGruppen.length;

    return { renderInput, zeilenAnzahlGesamt };
  }

  private async aufloesenOderVergeben(
    entitaetTyp: 'endkunde' | 'station' | 'messkanal' | 'geraetegruppe',
    refs: readonly string[],
    schreibend: boolean,
  ): Promise<Map<string, string>> {
    if (schreibend) {
      const eintraege = await Promise.all(refs.map(async (ref) => [ref, await this.pseudonymRepository.findeOderErstelle(entitaetTyp, ref)] as const));
      return new Map(eintraege);
    }
    return this.pseudonymRepository.findeBestehende(entitaetTyp, refs);
  }

  private async persistiere(
    header: ExportRenderHeader,
    ergebnis: ExportRenderErgebnis,
    erzeugtVonSub: string,
    zeilenAnzahlGesamt: number,
  ): Promise<{ readonly exportRow: NachweisExport; readonly dateien: readonly NachweisExportDatei[] }> {
    const exportRow = await this.exportRepository.insertExport({
      id: header.exportId,
      einsparlaufId: header.einsparlaufId,
      schemaCode: header.schemaCode,
      schemaVersion: header.schemaVersion,
      format: 'csv',
      zweck: header.zweck as ExportZweck,
      pseudonymProfil: header.pseudonymProfil,
      stationDarstellung: header.stationDarstellung,
      anfrageRef: header.anfrageRef,
      manifestHash: ergebnis.manifestHash,
      dateienAnzahl: ergebnis.dateien.length,
      zeilenAnzahlGesamt,
      erzeugtAt: header.erzeugtAtUtc,
      erzeugtVonSub,
    });
    await this.exportRepository.insertExportDateien(
      exportRow.id,
      ergebnis.dateien.map((d) => ({ dateiname: d.dateiname, kategorie: d.kategorie, zeilenAnzahl: d.zeilenAnzahl, dateiHash: d.hash })),
    );
    const dateien = await this.exportRepository.findDateienByExportId(exportRow.id);
    return { exportRow, dateien };
  }
}
