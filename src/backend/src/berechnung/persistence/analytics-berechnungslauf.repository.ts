import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import { toMesskonzeptTyp, type MesskonzeptTyp } from './mvet-lookup.repository';
import type { Energietraeger } from '../../stammdaten/persistence/energy/energy-zaehler.repository';
import { decodeCursor, encodeCursor } from '../../stammdaten/persistence/cursor.util';
import type { PaginatedResult } from '../../stammdaten/persistence/cursor.util';
import type { BerechnungslaufListItem } from '../berechnungslauf.types';
import { toIsoDateString } from './pg-date.util';

export type QualitaetsStufe = 'belastbar' | 'eingeschraenkt' | 'nicht_ausweisbar';
export type Ausloeser = 'manuell' | 'job' | 'nachlauf_korrektur';

export interface BerechnungslaufRow {
  readonly id: string;
  readonly endkundeId: string;
  readonly energietraeger: Energietraeger;
  readonly mvetId: string;
  readonly verfahrenCode: string;
  readonly verfahrenVersion: number;
  readonly periodeVon: string;
  readonly periodeBis: string;
  readonly baselineWertKwh: number;
  readonly grundlastAnteil: number;
  readonly gtzBase: number;
  readonly gtzNorm: number | null;
  readonly baselineNormKwh: number | null;
  readonly qualitaetsStufeMin: QualitaetsStufe;
  /**
   * Klimastation des Laufs. Wird gelesen, damit eine Neuberechnung
   * dieselbe Station verwendet wie der ersetzte Lauf — sonst rechnete die
   * Korrektur gegen ein anderes Wetter als das Original.
   */
  readonly stationRef: string;
  readonly ausloeser: Ausloeser;
  readonly ersetztLaufId: string | null;
  readonly erstelltAt: string;
  /** V0076 — Messkonzept, mit dem DIESER Lauf gerechnet hat (eingefroren, nicht am Messkonzept nachgeschlagen). */
  readonly messkonzeptTyp: MesskonzeptTyp;
  /** V0076 — Guete der Baseline-Anpassung; `null` beim vereinfachten Verfahren (es wurde nichts angepasst). */
  readonly gueteR2: number | null;
  readonly gueteCvRmsePct: number | null;
  readonly gueteNmbePct: number | null;
  readonly guetePunkte: number | null;
  /** V0076 — Abstand der angepassten von der erfassten Jahres-Baseline in Prozent. */
  readonly baselineAbweichungPct: number | null;
}

interface BerechnungslaufDbRow {
  readonly messkonzept_typ: string;
  readonly guete_r2: string | null;
  readonly guete_cv_rmse_pct: string | null;
  readonly guete_nmbe_pct: string | null;
  readonly guete_punkte: number | null;
  readonly baseline_abweichung_pct: string | null;
  readonly id: string;
  readonly endkunde_id: string;
  readonly energietraeger: string;
  readonly mvet_id: string;
  readonly verfahren_code: string;
  readonly verfahren_version: number;
  // `date`-Spalten: `pg` liefert HIER ein `Date`-Objekt (lokale Mitternacht,
  // KEIN String) — s. `pg-date.util.ts`-Kopf-Kommentar. `unknown` statt
  // `string`, damit `mapLaufRow()` NICHT versehentlich direkt durchreicht.
  readonly periode_von: unknown;
  readonly periode_bis: unknown;
  readonly baseline_wert_kwh: string;
  readonly grundlast_anteil: string;
  readonly gtz_base: string;
  readonly gtz_norm: string | null;
  readonly baseline_norm_kwh: string | null;
  readonly qualitaets_stufe_min: string;
  readonly station_ref: string;
  readonly ausloeser: string;
  readonly ersetzt_lauf_id: string | null;
  readonly erstellt_at: string;
}

const ENERGIETRAEGER_WERTE: readonly Energietraeger[] = ['strom', 'waerme', 'kaelte', 'gas', 'oel', 'biomasse'];
const QUALITAET_WERTE: readonly QualitaetsStufe[] = ['belastbar', 'eingeschraenkt', 'nicht_ausweisbar'];
const AUSLOESER_WERTE: readonly Ausloeser[] = ['manuell', 'job', 'nachlauf_korrektur'];

function toEnergietraeger(value: string): Energietraeger {
  return ENERGIETRAEGER_WERTE.find((k) => k === value) ?? 'strom';
}
function toQualitaetsStufe(value: string): QualitaetsStufe {
  return QUALITAET_WERTE.find((k) => k === value) ?? 'nicht_ausweisbar';
}
function toAusloeser(value: string): Ausloeser {
  return AUSLOESER_WERTE.find((k) => k === value) ?? 'manuell';
}

function mapLaufRow(row: BerechnungslaufDbRow): BerechnungslaufRow {
  return {
    id: row.id,
    endkundeId: row.endkunde_id,
    energietraeger: toEnergietraeger(row.energietraeger),
    mvetId: row.mvet_id,
    verfahrenCode: row.verfahren_code,
    verfahrenVersion: row.verfahren_version,
    periodeVon: toIsoDateString(row.periode_von),
    periodeBis: toIsoDateString(row.periode_bis),
    baselineWertKwh: Number.parseFloat(row.baseline_wert_kwh),
    grundlastAnteil: Number.parseFloat(row.grundlast_anteil),
    gtzBase: Number.parseFloat(row.gtz_base),
    gtzNorm: row.gtz_norm === null ? null : Number.parseFloat(row.gtz_norm),
    baselineNormKwh: row.baseline_norm_kwh === null ? null : Number.parseFloat(row.baseline_norm_kwh),
    qualitaetsStufeMin: toQualitaetsStufe(row.qualitaets_stufe_min),
    stationRef: row.station_ref,
    ausloeser: toAusloeser(row.ausloeser),
    ersetztLaufId: row.ersetzt_lauf_id,
    erstelltAt: row.erstellt_at,
    messkonzeptTyp: toMesskonzeptTyp(row.messkonzept_typ),
    gueteR2: row.guete_r2 === null ? null : Number.parseFloat(row.guete_r2),
    gueteCvRmsePct: row.guete_cv_rmse_pct === null ? null : Number.parseFloat(row.guete_cv_rmse_pct),
    gueteNmbePct: row.guete_nmbe_pct === null ? null : Number.parseFloat(row.guete_nmbe_pct),
    guetePunkte: row.guete_punkte,
    baselineAbweichungPct:
      row.baseline_abweichung_pct === null ? null : Number.parseFloat(row.baseline_abweichung_pct),
  };
}

const LAUF_COLUMNS =
  'id, endkunde_id, energietraeger, mvet_id, verfahren_code, verfahren_version, periode_von, periode_bis, ' +
  'baseline_wert_kwh, grundlast_anteil, gtz_base, gtz_norm, baseline_norm_kwh, qualitaets_stufe_min, station_ref, ' +
  'ausloeser, ersetzt_lauf_id, erstellt_at, messkonzept_typ, guete_r2, guete_cv_rmse_pct, guete_nmbe_pct, ' +
  'guete_punkte, baseline_abweichung_pct';

const LIST_COLUMNS =
  'id, energietraeger, verfahren_code, verfahren_version, periode_von, periode_bis, ' +
  'qualitaets_stufe_min, ausloeser, ersetzt_lauf_id, erstellt_at';

interface BerechnungslaufListDbRow {
  readonly id: string;
  readonly energietraeger: string;
  readonly verfahren_code: string;
  readonly verfahren_version: number;
  readonly periode_von: unknown;
  readonly periode_bis: unknown;
  readonly qualitaets_stufe_min: string;
  readonly ausloeser: string;
  readonly ersetzt_lauf_id: string | null;
  readonly erstellt_at: string;
}

function mapListItemRow(row: BerechnungslaufListDbRow): BerechnungslaufListItem {
  return {
    id: row.id,
    energietraeger: toEnergietraeger(row.energietraeger),
    verfahrenCode: row.verfahren_code,
    verfahrenVersion: row.verfahren_version,
    periodeVon: toIsoDateString(row.periode_von),
    periodeBis: toIsoDateString(row.periode_bis),
    qualitaetsStufeMin: toQualitaetsStufe(row.qualitaets_stufe_min),
    ausloeser: toAusloeser(row.ausloeser),
    ersetztLaufId: row.ersetzt_lauf_id,
    // Auf ms-ISO normalisiert: der `pg`-Treiber liefert `timestamptz` als
    // JS-`Date` (nur ms-genau). Diese ms-ISO-Form trägt AUCH den Cursor —
    // die Keyset-Query vergleicht deshalb bewusst `date_trunc('milliseconds',
    // erstellt_at)` (s. findByEndkundeId), sonst schlösse die Grenzzeile
    // sich mit ihren DB-Mikrosekunden selbst wieder ein.
    erstelltAt: new Date(row.erstellt_at).toISOString(),
  };
}

export interface InsertLaufInput {
  readonly id: string;
  readonly endkundeId: string;
  readonly energietraeger: Energietraeger;
  readonly mvetId: string;
  readonly verfahrenCode: string;
  readonly verfahrenVersion: number;
  readonly parameter: Record<string, unknown>;
  readonly parameterHash: Buffer;
  readonly periodeVon: string;
  readonly periodeBis: string;
  readonly messwertSnapshotId: string;
  readonly klimaSnapshotId: string;
  /** V0027 — dritte Snapshot-Art (D7/A5). `null` = kein System dieser mvet zugeordnet ODER keine gültigen `einfluss.intervall`-Zeilen im Lauf-Zeitraum (Regelfall in v1, s. `BerechnungslaufService`). */
  readonly einflussgroesseSnapshotId: string | null;
  readonly stationRef: string;
  readonly rohdatenHash: Buffer;
  readonly baselineWertKwh: number;
  readonly grundlastAnteil: number;
  readonly gtzBase: number;
  readonly gtzNorm: number | null;
  readonly baselineNormKwh: number | null;
  readonly qualitaetsStufeMin: QualitaetsStufe;
  readonly ausloeser: Ausloeser;
  readonly codeRevision: string;
  readonly ersetztLaufId: string | null;
  readonly messkonzeptTyp: MesskonzeptTyp;
  readonly gueteR2: number | null;
  readonly gueteCvRmsePct: number | null;
  readonly gueteNmbePct: number | null;
  readonly guetePunkte: number | null;
  readonly baselineAbweichungPct: number | null;
}

export interface LaufergebnisZeileInput {
  readonly monat: string;
  readonly referenzKwh: number;
  readonly istKwh: number;
  readonly gtzIst: number;
  readonly tageGesamt: number;
  readonly tageGemessen: number;
  readonly tageGeschaetzt: number;
  readonly tageErsatz: number;
  readonly tageFehlend: number;
  readonly abdeckungPct: number;
  readonly qualitaetsStufe: QualitaetsStufe;
}

export type LaufergebnisRow = LaufergebnisZeileInput;

interface LaufergebnisDbRow {
  // `date`-Spalte — s. Kommentar bei `BerechnungslaufDbRow.periode_von`.
  readonly monat: unknown;
  readonly referenz_kwh: string;
  readonly ist_kwh: string;
  readonly gtz_ist: string;
  readonly tage_gesamt: number;
  readonly tage_gemessen: number;
  readonly tage_geschaetzt: number;
  readonly tage_ersatz: number;
  readonly tage_fehlend: number;
  readonly abdeckung_pct: string;
  readonly qualitaets_stufe: string;
}

function mapErgebnisRow(row: LaufergebnisDbRow): LaufergebnisRow {
  return {
    monat: toIsoDateString(row.monat),
    referenzKwh: Number.parseFloat(row.referenz_kwh),
    istKwh: Number.parseFloat(row.ist_kwh),
    gtzIst: Number.parseFloat(row.gtz_ist),
    tageGesamt: row.tage_gesamt,
    tageGemessen: row.tage_gemessen,
    tageGeschaetzt: row.tage_geschaetzt,
    tageErsatz: row.tage_ersatz,
    tageFehlend: row.tage_fehlend,
    abdeckungPct: Number.parseFloat(row.abdeckung_pct),
    qualitaetsStufe: toQualitaetsStufe(row.qualitaets_stufe),
  };
}

/**
 * `analytics.berechnungslauf`/`laufergebnis`/`lauf_retention_status` (D1/A7)
 * — APPEND-ONLY (`edms_app`: NUR INSERT/SELECT auf `berechnungslauf`/
 * `laufergebnis`, INSERT/SELECT/UPDATE auf `lauf_retention_status` — s.
 * V0019-GRANTs). Diese Klasse enthält daher AUSDRÜCKLICH KEINE
 * `update`/`delete`-Methode auf `berechnungslauf`/`laufergebnis` — nicht aus
 * Versehen, sondern weil die DB-Rolle es strukturell verweigern würde
 * (`42501`, s. Append-only-Nachweistest).
 */
@Injectable()
export class AnalyticsBerechnungslaufRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insertLauf(input: InsertLaufInput): Promise<BerechnungslaufRow> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO analytics.berechnungslauf
         (id, endkunde_id, energietraeger, mvet_id, verfahren_code, verfahren_version, parameter, parameter_hash,
          periode_von, periode_bis, messwert_snapshot_id, klima_snapshot_id, station_ref, rohdaten_hash,
          baseline_wert_kwh, grundlast_anteil, gtz_base, gtz_norm, baseline_norm_kwh, qualitaets_stufe_min,
          ausloeser, code_revision, ersetzt_lauf_id, einflussgroesse_snapshot_id,
          messkonzept_typ, guete_r2, guete_cv_rmse_pct, guete_nmbe_pct, guete_punkte, baseline_abweichung_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10::date,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
               $25,$26,$27,$28,$29,$30)
       RETURNING ${LAUF_COLUMNS}`,
      [
        input.id,
        input.endkundeId,
        input.energietraeger,
        input.mvetId,
        input.verfahrenCode,
        input.verfahrenVersion,
        JSON.stringify(input.parameter),
        input.parameterHash,
        input.periodeVon,
        input.periodeBis,
        input.messwertSnapshotId,
        input.klimaSnapshotId,
        input.stationRef,
        input.rohdatenHash,
        input.baselineWertKwh,
        input.grundlastAnteil,
        input.gtzBase,
        input.gtzNorm,
        input.baselineNormKwh,
        input.qualitaetsStufeMin,
        input.ausloeser,
        input.codeRevision,
        input.ersetztLaufId,
        input.einflussgroesseSnapshotId,
        input.messkonzeptTyp,
        input.gueteR2,
        input.gueteCvRmsePct,
        input.gueteNmbePct,
        input.guetePunkte,
        input.baselineAbweichungPct,
      ],
    );

    const result = mapOneRow(bindRows<BerechnungslaufDbRow>(rawRows), mapLaufRow);
    if (result === undefined) {
      throw new Error('analytics.berechnungslauf-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }
    return result;
  }

  async insertLaufergebnisZeilen(laufId: string, zeilen: readonly LaufergebnisZeileInput[]): Promise<void> {
    for (const zeile of zeilen) {
      await this.txHost.tx.query(
        `INSERT INTO analytics.laufergebnis
           (lauf_id, monat, referenz_kwh, ist_kwh, gtz_ist, tage_gesamt, tage_gemessen, tage_geschaetzt,
            tage_ersatz, tage_fehlend, abdeckung_pct, qualitaets_stufe)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          laufId,
          zeile.monat,
          zeile.referenzKwh,
          zeile.istKwh,
          zeile.gtzIst,
          zeile.tageGesamt,
          zeile.tageGemessen,
          zeile.tageGeschaetzt,
          zeile.tageErsatz,
          zeile.tageFehlend,
          zeile.abdeckungPct,
          zeile.qualitaetsStufe,
        ],
      );
    }
  }

  /** `analytics.lauf_retention_status` (A7) — beim Lauf-Insert IMMER mit `nachweis_gebunden=false, legal_hold=false` angelegt (DB-Defaults, keine Werte hier explizit gesetzt). */
  async insertRetentionStatus(laufId: string): Promise<void> {
    await this.txHost.tx.query(`INSERT INTO analytics.lauf_retention_status (lauf_id) VALUES ($1)`, [laufId]);
  }

  /**
   * Die Klimastations-Kennungen, die für diesen Endkunden schon einmal
   * verwendet wurden — neueste zuerst.
   *
   * `stationRef` ist ein frei gewählter String ohne Auflösung (ADR-0006 O-B5
   * ist offen). Ein leeres Textfeld waere die naechste Ratestelle: Wer
   * `DWD-4931` statt `dwd_4931` eintippt, bekommt einen Lauf gegen eine
   * Station, die es nicht gibt, und merkt es erst an den Gradtagzahlen.
   * Deshalb Vorschlaege aus dem, was fuer diesen Kunden bereits gerechnet
   * wurde — die Liste bleibt trotzdem offen, ein neuer Kunde hat keine.
   */
  async listeStationRefs(endkundeId: string): Promise<string[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT station_ref, max(erstellt_at) AS zuletzt
         FROM analytics.berechnungslauf
        WHERE endkunde_id = $1
        GROUP BY station_ref
        ORDER BY zuletzt DESC
        LIMIT 10`,
      [endkundeId],
    );
    return (rawRows as { station_ref: string }[]).map((r) => r.station_ref);
  }

  async findById(laufId: string): Promise<BerechnungslaufRow | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${LAUF_COLUMNS} FROM analytics.berechnungslauf WHERE id = $1`,
      [laufId],
    );
    return mapOneRow(bindRows<BerechnungslaufDbRow>(rawRows), mapLaufRow);
  }

  /** NUR `endkunde_id` — schlanker Lesepfad für die ABAC-Ressourcen-Attribut-Auflösung (`StammdatenResourceAttributesProvider`). */
  async findEndkundeIdById(laufId: string): Promise<string | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT endkunde_id FROM analytics.berechnungslauf WHERE id = $1`,
      [laufId],
    );
    return mapOneRow(bindRows<{ readonly endkunde_id: string }>(rawRows), (row) => row.endkunde_id);
  }

  /**
   * `true`, wenn ein ANDERER Lauf diesen hier ersetzt.
   *
   * Dieselbe Leserichtung wie die Auswahlregel (V0019): Ersetzt ist ein Lauf
   * genau dann, wenn ein Nachfolger auf ihn zeigt — nicht, wenn er selbst
   * eine Referenz traegt.
   */
  async existiertNachfolger(laufId: string): Promise<boolean> {
    return (await this.findNachfolgerId(laufId)) !== undefined;
  }

  /**
   * Die Id des Laufs, der diesen hier ersetzt — `undefined`, wenn keiner
   * existiert.
   *
   * Der Lauf selbst weiss nur, WEN er ersetzt. Ob er SELBST ueberholt ist,
   * steht nirgends an ihm; ohne diese Auskunft liest jemand eine alte Zahl,
   * ohne zu erkennen, dass sie nicht mehr gilt.
   */
  async findNachfolgerId(laufId: string): Promise<string | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT id FROM analytics.berechnungslauf WHERE ersetzt_lauf_id = $1 ORDER BY erstellt_at DESC LIMIT 1`,
      [laufId],
    );
    return mapOneRow(bindRows<{ readonly id: string }>(rawRows), (row) => row.id);
  }

  async findErgebnisseByLaufId(laufId: string): Promise<LaufergebnisRow[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT monat, referenz_kwh, ist_kwh, gtz_ist, tage_gesamt, tage_gemessen, tage_geschaetzt, tage_ersatz,
              tage_fehlend, abdeckung_pct, qualitaets_stufe
         FROM analytics.laufergebnis
        WHERE lauf_id = $1
        ORDER BY monat ASC`,
      [laufId],
    );
    return mapManyRows(bindRows<LaufergebnisDbRow>(rawRows), mapErgebnisRow);
  }

  /**
   * `GET /berechnung/endkunden/{endkundeId}/laeufe` — PII-freie Liste je
   * Endkunde, Cursor-Pagination (`ORDER BY erstellt_at ASC, id ASC`,
   * Look-ahead `LIMIT+1`, Keyset-Muster wie `energy.endkunde_shred_antrag`).
   * `erstellt_at` (timestamptz) trägt den Cursor als `createdAt`
   * (Payload-Feldname des gemeinsamen Cursors, `cursor.util.ts`).
   */
  async findByEndkundeId(
    endkundeId: string,
    optionen: { readonly cursor?: string; readonly limit: number },
  ): Promise<PaginatedResult<BerechnungslaufListItem>> {
    const params: unknown[] = [endkundeId];
    let keyset = '';
    const decoded = optionen.cursor === undefined ? undefined : decodeCursor(optionen.cursor);
    if (decoded !== undefined) {
      params.push(decoded.createdAt, decoded.id);
      const a = params.length - 1;
      const b = params.length;
      // Vergleich auf Millisekunden-Präzision (beide Seiten): der Cursor trägt
      // eine ms-genaue JS-`Date`-Ableitung, die Spalte hat Mikrosekunden —
      // ohne `date_trunc` würde `erstellt_at > cursor` die Grenzzeile selbst
      // wieder einschließen (Same-Second-Pagination-Bug).
      keyset = `AND (date_trunc('milliseconds', erstellt_at) > $${String(a)}::timestamptz OR (date_trunc('milliseconds', erstellt_at) = $${String(a)}::timestamptz AND id > $${String(b)}::uuid))`;
    }
    params.push(optionen.limit + 1);
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${LIST_COLUMNS} FROM analytics.berechnungslauf
        WHERE endkunde_id = $1 ${keyset}
        ORDER BY date_trunc('milliseconds', erstellt_at) ASC, id ASC
        LIMIT $${String(params.length)}`,
      params,
    );
    const alle = mapManyRows(bindRows<BerechnungslaufListDbRow>(rawRows), mapListItemRow);
    if (alle.length > optionen.limit) {
      const daten = alle.slice(0, optionen.limit);
      const letzter = daten[daten.length - 1];
      const naechsterCursor =
        letzter === undefined ? null : encodeCursor({ createdAt: letzter.erstelltAt, id: letzter.id });
      return { daten, naechsterCursor };
    }
    return { daten: alle, naechsterCursor: null };
  }
}
