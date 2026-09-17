import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import { decodeCursor, encodeCursor } from '../../stammdaten/persistence/cursor.util';
import type { PaginatedResult } from '../../stammdaten/persistence/cursor.util';
import { toIsoDateString } from '../../berechnung/persistence/pg-date.util';
import type { JahresStatus, MonatsQualitaetsStufe } from '../domain/einsparung';
import type { MonatsBehandlung } from '../domain/monats-behandlung';

export type EinsparlaufArt = 'foerderjahr_nachweis' | 'zwischenstand';
export type EinsparlaufAusloeser = 'manuell' | 'job' | 'korrektur';
export type ErgebnisStatus = 'ausgewiesen' | 'nicht_nachweisbar' | 'ausgeschlossen';
export type AusschlussGrundCode = 'datenschutzrechtliche_einschraenkung' | 'energietraeger_substitution_v1_nicht_unterstuetzt' | 'nicht_nachweisbar';

export interface Einsparlauf {
  readonly id: string;
  readonly foerderjahrId: string;
  readonly art: EinsparlaufArt;
  readonly verfahrenCode: string;
  readonly verfahrenVersion: number;
  readonly parameter: Record<string, unknown>;
  /**
   * ADR-0007 Stufe 2 (D5-Metablatt: „bindungs_hash") — NACHGETRAGEN
   * gegenüber der ursprünglichen Stufe-1-Domäne (die Spalte existiert seit
   * V0025, wurde aber bislang nicht bis in dieses DTO durchgereicht, da
   * Stufe 1 sie nicht brauchte). Additive, rückwärtskompatible Erweiterung
   * — kein bestehender Aufrufer liest ein jetzt fehlendes Feld.
   */
  readonly bindungsHash: Buffer;
  readonly preflightId: string;
  readonly umfangPaareAnzahl: number;
  readonly monateErwartet: number;
  readonly monateGebunden: number;
  readonly gebundeneLaeufeAnzahl: number;
  readonly qualitaetsStufeMin: MonatsQualitaetsStufe;
  readonly ausloeser: EinsparlaufAusloeser;
  readonly codeRevision: string;
  readonly synthetic: boolean;
  readonly ersetztEinsparlaufId: string | null;
  readonly erstelltAt: string;
  readonly erstelltVonSub: string;
}

interface EinsparlaufDbRow {
  readonly id: string;
  readonly foerderjahr_id: string;
  readonly art: string;
  readonly verfahren_code: string;
  readonly verfahren_version: number;
  readonly parameter: unknown;
  readonly bindungs_hash: Buffer;
  readonly preflight_id: string;
  readonly umfang_paare_anzahl: number;
  readonly monate_erwartet: number;
  readonly monate_gebunden: number;
  readonly gebundene_laeufe_anzahl: number;
  readonly qualitaets_stufe_min: string;
  readonly ausloeser: string;
  readonly code_revision: string;
  readonly synthetic: boolean;
  readonly ersetzt_einsparlauf_id: string | null;
  readonly erstellt_at: string;
  readonly erstellt_von_sub: string;
}

const QUALITAET_WERTE: readonly MonatsQualitaetsStufe[] = ['belastbar', 'eingeschraenkt', 'nicht_ausweisbar'];
function toQualitaetsStufe(value: string): MonatsQualitaetsStufe {
  return QUALITAET_WERTE.find((k) => k === value) ?? 'nicht_ausweisbar';
}
function toArt(value: string): EinsparlaufArt {
  return value === 'zwischenstand' ? 'zwischenstand' : 'foerderjahr_nachweis';
}
function toAusloeser(value: string): EinsparlaufAusloeser {
  return value === 'job' || value === 'korrektur' ? value : 'manuell';
}

function mapEinsparlaufRow(row: EinsparlaufDbRow): Einsparlauf {
  return {
    id: row.id,
    foerderjahrId: row.foerderjahr_id,
    art: toArt(row.art),
    verfahrenCode: row.verfahren_code,
    verfahrenVersion: row.verfahren_version,
    parameter: row.parameter as Record<string, unknown>,
    bindungsHash: row.bindungs_hash,
    preflightId: row.preflight_id,
    umfangPaareAnzahl: row.umfang_paare_anzahl,
    monateErwartet: row.monate_erwartet,
    monateGebunden: row.monate_gebunden,
    gebundeneLaeufeAnzahl: row.gebundene_laeufe_anzahl,
    qualitaetsStufeMin: toQualitaetsStufe(row.qualitaets_stufe_min),
    ausloeser: toAusloeser(row.ausloeser),
    codeRevision: row.code_revision,
    synthetic: row.synthetic,
    ersetztEinsparlaufId: row.ersetzt_einsparlauf_id,
    erstelltAt: row.erstellt_at,
    erstelltVonSub: row.erstellt_von_sub,
  };
}

const LAUF_COLUMNS =
  'id, foerderjahr_id, art, verfahren_code, verfahren_version, parameter, bindungs_hash, preflight_id, umfang_paare_anzahl, ' +
  'monate_erwartet, monate_gebunden, gebundene_laeufe_anzahl, qualitaets_stufe_min, ausloeser, code_revision, ' +
  'synthetic, ersetzt_einsparlauf_id, erstellt_at, erstellt_von_sub';

export interface InsertEinsparlaufInput {
  readonly id: string;
  readonly foerderjahrId: string;
  readonly art: EinsparlaufArt;
  readonly verfahrenCode: string;
  readonly verfahrenVersion: number;
  readonly parameter: Record<string, unknown>;
  readonly parameterHash: Buffer;
  readonly preflightId: string;
  readonly bindungsHash: Buffer;
  readonly umfangPaareAnzahl: number;
  readonly monateErwartet: number;
  readonly monateGebunden: number;
  readonly gebundeneLaeufeAnzahl: number;
  readonly qualitaetsStufeMin: MonatsQualitaetsStufe;
  readonly ausloeser: EinsparlaufAusloeser;
  readonly codeRevision: string;
  readonly synthetic: boolean;
  readonly ersetztEinsparlaufId: string | null;
  readonly erstelltVonSub: string;
}

export interface InsertBindungInput {
  readonly endkundeId: string;
  readonly energietraeger: string;
  readonly monat: string;
  readonly berechnungslaufId: string;
  readonly referenzKwh: number;
  readonly istKwh: number;
  readonly deltaKwh: number;
  readonly deltaAusgewiesenKwh: number;
  readonly qualitaetsStufe: MonatsQualitaetsStufe;
  readonly behandlung: MonatsBehandlung;
  readonly kandidatenAnzahl: number;
}

export interface InsertErgebnisInput {
  readonly endkundeId: string;
  readonly energietraeger: string;
  readonly status: ErgebnisStatus;
  readonly ausschlussGrundCode: AusschlussGrundCode | null;
  readonly referenzKwhSumme: number | null;
  readonly istKwhSumme: number | null;
  readonly einsparungKwhEndenergie: number | null;
  readonly monateAusgewiesen: number;
  readonly monateErsatz: number;
  readonly monateFehlend: number;
  /** Trägt in v1 den Jahres-Status (`JahresStatus`, s. `domain/einsparung.ts`) — freitextige Spalte ohne DB-CHECK, s. Design-Entscheidungen in der finalen Antwort. */
  readonly qualitaetsStufeMin: JahresStatus;
  readonly wissAuswertungAusgenommen: boolean;
}

export interface EinsparlaufBindung extends InsertBindungInput {
  readonly einsparlaufId: string;
}

export interface EinsparlaufErgebnis extends InsertErgebnisInput {
  readonly einsparlaufId: string;
}

interface BindungDbRow {
  readonly einsparlauf_id: string;
  readonly endkunde_id: string;
  readonly energietraeger: string;
  readonly monat: unknown;
  readonly berechnungslauf_id: string;
  readonly referenz_kwh: string;
  readonly ist_kwh: string;
  readonly delta_kwh: string;
  readonly delta_ausgewiesen_kwh: string;
  readonly qualitaets_stufe: string;
  readonly behandlung: string;
  readonly kandidaten_anzahl: number;
}

function mapBindungRow(row: BindungDbRow): EinsparlaufBindung {
  return {
    einsparlaufId: row.einsparlauf_id,
    endkundeId: row.endkunde_id,
    energietraeger: row.energietraeger,
    monat: toIsoDateString(row.monat),
    berechnungslaufId: row.berechnungslauf_id,
    referenzKwh: Number.parseFloat(row.referenz_kwh),
    istKwh: Number.parseFloat(row.ist_kwh),
    deltaKwh: Number.parseFloat(row.delta_kwh),
    deltaAusgewiesenKwh: Number.parseFloat(row.delta_ausgewiesen_kwh),
    qualitaetsStufe: toQualitaetsStufe(row.qualitaets_stufe),
    behandlung: row.behandlung === 'ausgeschlossen' ? 'ausgeschlossen' : 'gemessen',
    kandidatenAnzahl: row.kandidaten_anzahl,
  };
}

interface ErgebnisDbRow {
  readonly einsparlauf_id: string;
  readonly endkunde_id: string;
  readonly energietraeger: string;
  readonly status: string;
  readonly ausschluss_grund_code: string | null;
  readonly referenz_kwh_summe: string | null;
  readonly ist_kwh_summe: string | null;
  readonly einsparung_kwh_endenergie: string | null;
  readonly monate_ausgewiesen: number;
  readonly monate_ersatz: number;
  readonly monate_fehlend: number;
  readonly qualitaets_stufe_min: string;
  readonly wiss_auswertung_ausgenommen: boolean;
}

function toErgebnisStatus(value: string): ErgebnisStatus {
  return value === 'nicht_nachweisbar' || value === 'ausgeschlossen' ? value : 'ausgewiesen';
}
function toAusschlussGrundCode(value: string | null): AusschlussGrundCode | null {
  if (value === 'datenschutzrechtliche_einschraenkung' || value === 'energietraeger_substitution_v1_nicht_unterstuetzt' || value === 'nicht_nachweisbar') {
    return value;
  }
  return null;
}
function toJahresStatus(value: string): JahresStatus {
  return value === 'eingeschraenkt' || value === 'nicht_nachweisbar' ? value : 'belastbar';
}

function mapErgebnisRow(row: ErgebnisDbRow): EinsparlaufErgebnis {
  return {
    einsparlaufId: row.einsparlauf_id,
    endkundeId: row.endkunde_id,
    energietraeger: row.energietraeger,
    status: toErgebnisStatus(row.status),
    ausschlussGrundCode: toAusschlussGrundCode(row.ausschluss_grund_code),
    referenzKwhSumme: row.referenz_kwh_summe === null ? null : Number.parseFloat(row.referenz_kwh_summe),
    istKwhSumme: row.ist_kwh_summe === null ? null : Number.parseFloat(row.ist_kwh_summe),
    einsparungKwhEndenergie: row.einsparung_kwh_endenergie === null ? null : Number.parseFloat(row.einsparung_kwh_endenergie),
    monateAusgewiesen: row.monate_ausgewiesen,
    monateErsatz: row.monate_ersatz,
    monateFehlend: row.monate_fehlend,
    qualitaetsStufeMin: toJahresStatus(row.qualitaets_stufe_min),
    wissAuswertungAusgenommen: row.wiss_auswertung_ausgenommen,
  };
}

export interface EinsparlaufListItem {
  readonly id: string;
  readonly foerderjahrId: string;
  readonly art: EinsparlaufArt;
  readonly qualitaetsStufeMin: MonatsQualitaetsStufe;
  readonly ersetztEinsparlaufId: string | null;
  readonly erstelltAt: string;
}

/**
 * `nachweis.einsparlauf`/`_bindung`/`_ergebnis` (D1/D2) — append-only
 * (`edms_app`: NUR `INSERT, SELECT`, V0025-GRANTs; Owner `edms_nachweis_
 * owner`). Diese Klasse enthält bewusst KEINE `update`/`delete`-Methode —
 * die DB-Rolle würde das ohnehin verweigern (`42501`).
 */
@Injectable()
export class NachweisEinsparlaufRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insertLauf(input: InsertEinsparlaufInput): Promise<Einsparlauf> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO nachweis.einsparlauf
         (id, foerderjahr_id, art, verfahren_code, verfahren_version, parameter, parameter_hash, preflight_id,
          bindungs_hash, umfang_paare_anzahl, monate_erwartet, monate_gebunden, gebundene_laeufe_anzahl,
          qualitaets_stufe_min, ausloeser, code_revision, synthetic, ersetzt_einsparlauf_id, erstellt_von_sub)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING ${LAUF_COLUMNS}`,
      [
        input.id,
        input.foerderjahrId,
        input.art,
        input.verfahrenCode,
        input.verfahrenVersion,
        JSON.stringify(input.parameter),
        input.parameterHash,
        input.preflightId,
        input.bindungsHash,
        input.umfangPaareAnzahl,
        input.monateErwartet,
        input.monateGebunden,
        input.gebundeneLaeufeAnzahl,
        input.qualitaetsStufeMin,
        input.ausloeser,
        input.codeRevision,
        input.synthetic,
        input.ersetztEinsparlaufId,
        input.erstelltVonSub,
      ],
    );
    const result = mapOneRow(bindRows<EinsparlaufDbRow>(rawRows), mapEinsparlaufRow);
    if (result === undefined) {
      throw new Error('nachweis.einsparlauf-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }
    return result;
  }

  async insertBindungen(einsparlaufId: string, bindungen: readonly InsertBindungInput[]): Promise<void> {
    for (const b of bindungen) {
      await this.txHost.tx.query(
        `INSERT INTO nachweis.einsparlauf_bindung
           (einsparlauf_id, endkunde_id, energietraeger, monat, berechnungslauf_id, referenz_kwh, ist_kwh,
            delta_kwh, delta_ausgewiesen_kwh, qualitaets_stufe, behandlung, kandidaten_anzahl)
         VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          einsparlaufId,
          b.endkundeId,
          b.energietraeger,
          b.monat,
          b.berechnungslaufId,
          b.referenzKwh,
          b.istKwh,
          b.deltaKwh,
          b.deltaAusgewiesenKwh,
          b.qualitaetsStufe,
          b.behandlung,
          b.kandidatenAnzahl,
        ],
      );
    }
  }

  async insertErgebnisse(einsparlaufId: string, ergebnisse: readonly InsertErgebnisInput[]): Promise<void> {
    for (const e of ergebnisse) {
      await this.txHost.tx.query(
        `INSERT INTO nachweis.einsparlauf_ergebnis
           (einsparlauf_id, endkunde_id, energietraeger, status, ausschluss_grund_code, referenz_kwh_summe,
            ist_kwh_summe, einsparung_kwh_endenergie, monate_ausgewiesen, monate_ersatz, monate_fehlend,
            qualitaets_stufe_min, wiss_auswertung_ausgenommen)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          einsparlaufId,
          e.endkundeId,
          e.energietraeger,
          e.status,
          e.ausschlussGrundCode,
          e.referenzKwhSumme,
          e.istKwhSumme,
          e.einsparungKwhEndenergie,
          e.monateAusgewiesen,
          e.monateErsatz,
          e.monateFehlend,
          e.qualitaetsStufeMin,
          e.wissAuswertungAusgenommen,
        ],
      );
    }
  }

  async findById(id: string): Promise<Einsparlauf | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(`SELECT ${LAUF_COLUMNS} FROM nachweis.einsparlauf WHERE id = $1`, [id]);
    return mapOneRow(bindRows<EinsparlaufDbRow>(rawRows), mapEinsparlaufRow);
  }

  /** Schlanker Existenz-/ABAC-Lesepfad (`StammdatenResourceAttributesProvider.resolveViaEinsparlauf()`). */
  async existsById(id: string): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(`SELECT 1 AS x FROM nachweis.einsparlauf WHERE id = $1`, [id]);
    return bindRows<{ readonly x: number }>(rawRows).length > 0;
  }

  async findErgebnisseByLaufId(
    einsparlaufId: string,
    options: { readonly cursorPaar?: { readonly endkundeId: string; readonly energietraeger: string }; readonly limit: number },
  ): Promise<{ readonly daten: EinsparlaufErgebnis[]; readonly naechsterCursor: { readonly endkundeId: string; readonly energietraeger: string } | null }> {
    const params: unknown[] = [einsparlaufId];
    let whereZusatz = '';
    if (options.cursorPaar !== undefined) {
      params.push(options.cursorPaar.endkundeId, options.cursorPaar.energietraeger);
      whereZusatz = `AND (endkunde_id, energietraeger) > ($${String(params.length - 1)}::uuid, $${String(params.length)})`;
    }
    params.push(options.limit + 1);
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT einsparlauf_id, endkunde_id, energietraeger, status, ausschluss_grund_code, referenz_kwh_summe,
              ist_kwh_summe, einsparung_kwh_endenergie, monate_ausgewiesen, monate_ersatz, monate_fehlend,
              qualitaets_stufe_min, wiss_auswertung_ausgenommen
         FROM nachweis.einsparlauf_ergebnis
        WHERE einsparlauf_id = $1 ${whereZusatz}
        ORDER BY endkunde_id ASC, energietraeger ASC
        LIMIT $${String(params.length)}`,
      params,
    );
    const alle = mapManyRows(bindRows<ErgebnisDbRow>(rawRows), mapErgebnisRow);
    if (alle.length > options.limit) {
      const daten = alle.slice(0, options.limit);
      const letzter = daten[daten.length - 1];
      return {
        daten,
        naechsterCursor: letzter === undefined ? null : { endkundeId: letzter.endkundeId, energietraeger: letzter.energietraeger },
      };
    }
    return { daten: alle, naechsterCursor: null };
  }

  async findBindungenByLaufId(
    einsparlaufId: string,
    options: { readonly cursorPaar?: { readonly endkundeId: string; readonly energietraeger: string; readonly monat: string }; readonly limit: number },
  ): Promise<{ readonly daten: EinsparlaufBindung[]; readonly naechsterCursor: { readonly endkundeId: string; readonly energietraeger: string; readonly monat: string } | null }> {
    const params: unknown[] = [einsparlaufId];
    let whereZusatz = '';
    if (options.cursorPaar !== undefined) {
      params.push(options.cursorPaar.endkundeId, options.cursorPaar.energietraeger, options.cursorPaar.monat);
      whereZusatz = `AND (endkunde_id, energietraeger, monat) > ($${String(params.length - 2)}::uuid, $${String(params.length - 1)}, $${String(params.length)}::date)`;
    }
    params.push(options.limit + 1);
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT einsparlauf_id, endkunde_id, energietraeger, monat, berechnungslauf_id, referenz_kwh, ist_kwh,
              delta_kwh, delta_ausgewiesen_kwh, qualitaets_stufe, behandlung, kandidaten_anzahl
         FROM nachweis.einsparlauf_bindung
        WHERE einsparlauf_id = $1 ${whereZusatz}
        ORDER BY endkunde_id ASC, energietraeger ASC, monat ASC
        LIMIT $${String(params.length)}`,
      params,
    );
    const alle = mapManyRows(bindRows<BindungDbRow>(rawRows), mapBindungRow);
    if (alle.length > options.limit) {
      const daten = alle.slice(0, options.limit);
      const letzter = daten[daten.length - 1];
      return {
        daten,
        naechsterCursor: letzter === undefined ? null : { endkundeId: letzter.endkundeId, energietraeger: letzter.energietraeger, monat: letzter.monat },
      };
    }
    return { daten: alle, naechsterCursor: null };
  }

  async listPage(options: {
    readonly foerderjahrId?: string;
    readonly art?: EinsparlaufArt;
    readonly nurAktuelle?: boolean;
    readonly cursor?: string;
    readonly limit: number;
  }): Promise<PaginatedResult<EinsparlaufListItem>> {
    const params: unknown[] = [];
    const bedingungen: string[] = [];

    if (options.foerderjahrId !== undefined) {
      params.push(options.foerderjahrId);
      bedingungen.push(`foerderjahr_id = $${String(params.length)}`);
    }
    if (options.art !== undefined) {
      params.push(options.art);
      bedingungen.push(`art = $${String(params.length)}`);
    }
    if (options.nurAktuelle === true) {
      bedingungen.push('ersetzt_einsparlauf_id IS NULL');
    }
    const decoded = options.cursor !== undefined ? decodeCursor(options.cursor) : undefined;
    if (decoded !== undefined) {
      params.push(decoded.createdAt, decoded.id);
      const a = params.length - 1;
      const b = params.length;
      bedingungen.push(
        `(date_trunc('milliseconds', erstellt_at) > $${String(a)}::timestamptz OR (date_trunc('milliseconds', erstellt_at) = $${String(a)}::timestamptz AND id > $${String(b)}::uuid))`,
      );
    }
    params.push(options.limit + 1);
    const whereClause = bedingungen.length > 0 ? `WHERE ${bedingungen.join(' AND ')}` : '';

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT id, foerderjahr_id, art, qualitaets_stufe_min, ersetzt_einsparlauf_id, erstellt_at
         FROM nachweis.einsparlauf
         ${whereClause}
        ORDER BY date_trunc('milliseconds', erstellt_at) ASC, id ASC
        LIMIT $${String(params.length)}`,
      params,
    );
    const alle = mapManyRows(
      bindRows<{ readonly id: string; readonly foerderjahr_id: string; readonly art: string; readonly qualitaets_stufe_min: string; readonly ersetzt_einsparlauf_id: string | null; readonly erstellt_at: string }>(rawRows),
      (row) => ({
        id: row.id,
        foerderjahrId: row.foerderjahr_id,
        art: toArt(row.art),
        qualitaetsStufeMin: toQualitaetsStufe(row.qualitaets_stufe_min),
        ersetztEinsparlaufId: row.ersetzt_einsparlauf_id,
        erstelltAt: new Date(row.erstellt_at).toISOString(),
      }),
    );
    if (alle.length > options.limit) {
      const daten = alle.slice(0, options.limit);
      const letzter = daten[daten.length - 1];
      const naechsterCursor = letzter === undefined ? null : encodeCursor({ createdAt: letzter.erstelltAt, id: letzter.id });
      return { daten, naechsterCursor };
    }
    return { daten: alle, naechsterCursor: null };
  }
}
