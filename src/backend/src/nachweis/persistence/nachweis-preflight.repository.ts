import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import { toIsoDateString } from '../../berechnung/persistence/pg-date.util';

export type PreflightErgebnis = 'gruen' | 'rot';
export type PreflightBefundSchwere = 'blocker' | 'warnung' | 'hinweis';

export interface Preflight {
  readonly id: string;
  readonly foerderjahrId: string;
  readonly profilCode: string;
  readonly profilVersion: number;
  readonly ergebnis: PreflightErgebnis;
  readonly blockerAnzahl: number;
  readonly warnungAnzahl: number;
  readonly hinweisAnzahl: number;
  readonly umfangPaareAnzahl: number;
  readonly monateErwartet: number;
  readonly synthetic: boolean;
  readonly ausgefuehrtAt: string;
  readonly ausgefuehrtVonSub: string;
}

interface PreflightDbRow {
  readonly id: string;
  readonly foerderjahr_id: string;
  readonly profil_code: string;
  readonly profil_version: number;
  readonly ergebnis: string;
  readonly blocker_anzahl: number;
  readonly warnung_anzahl: number;
  readonly hinweis_anzahl: number;
  readonly umfang_paare_anzahl: number;
  readonly monate_erwartet: number;
  readonly synthetic: boolean;
  readonly ausgefuehrt_at: string;
  readonly ausgefuehrt_von_sub: string;
}

function toErgebnis(value: string): PreflightErgebnis {
  return value === 'gruen' ? 'gruen' : 'rot';
}

function mapPreflightRow(row: PreflightDbRow): Preflight {
  return {
    id: row.id,
    foerderjahrId: row.foerderjahr_id,
    profilCode: row.profil_code,
    profilVersion: row.profil_version,
    ergebnis: toErgebnis(row.ergebnis),
    blockerAnzahl: row.blocker_anzahl,
    warnungAnzahl: row.warnung_anzahl,
    hinweisAnzahl: row.hinweis_anzahl,
    umfangPaareAnzahl: row.umfang_paare_anzahl,
    monateErwartet: row.monate_erwartet,
    synthetic: row.synthetic,
    ausgefuehrtAt: row.ausgefuehrt_at,
    ausgefuehrtVonSub: row.ausgefuehrt_von_sub,
  };
}

const PREFLIGHT_COLUMNS =
  'id, foerderjahr_id, profil_code, profil_version, ergebnis, blocker_anzahl, warnung_anzahl, hinweis_anzahl, ' +
  'umfang_paare_anzahl, monate_erwartet, synthetic, ausgefuehrt_at, ausgefuehrt_von_sub';

export interface InsertPreflightInput {
  readonly id: string;
  readonly foerderjahrId: string;
  readonly profilCode: string;
  readonly profilVersion: number;
  readonly ergebnis: PreflightErgebnis;
  readonly blockerAnzahl: number;
  readonly warnungAnzahl: number;
  readonly hinweisAnzahl: number;
  readonly umfangPaareAnzahl: number;
  readonly monateErwartet: number;
  readonly synthetic: boolean;
  readonly ausgefuehrtVonSub: string;
}

export interface PreflightBefund {
  readonly preflightId: string;
  readonly lfd: number;
  readonly regelCode: string;
  readonly schwere: PreflightBefundSchwere;
  readonly endkundeId: string | null;
  readonly energietraeger: string | null;
  readonly monat: string | null;
  readonly kennzahlKlasse: string | null;
}

export interface InsertBefundInput {
  readonly regelCode: string;
  readonly schwere: PreflightBefundSchwere;
  readonly endkundeId?: string;
  readonly energietraeger?: string;
  readonly monat?: string;
  readonly kennzahlKlasse?: string;
}

interface BefundDbRow {
  readonly preflight_id: string;
  readonly lfd: number;
  readonly regel_code: string;
  readonly schwere: string;
  readonly endkunde_id: string | null;
  readonly energietraeger: string | null;
  readonly monat: unknown;
  readonly kennzahl_klasse: string | null;
}

function toSchwere(value: string): PreflightBefundSchwere {
  return value === 'blocker' || value === 'warnung' ? value : 'hinweis';
}

function mapBefundRow(row: BefundDbRow): PreflightBefund {
  return {
    preflightId: row.preflight_id,
    lfd: row.lfd,
    regelCode: row.regel_code,
    schwere: toSchwere(row.schwere),
    endkundeId: row.endkunde_id,
    energietraeger: row.energietraeger,
    monat: row.monat === null ? null : toIsoDateString(row.monat),
    kennzahlKlasse: row.kennzahl_klasse,
  };
}

/**
 * `nachweis.preflight`/`nachweis.preflight_befund` (D4) — append-only
 * (`edms_app`: NUR `INSERT, SELECT`, V0025-GRANTs; Owner `edms_nachweis_
 * owner`). `preflight_befund.lfd` ist der PK-Teil UND die natürliche
 * Cursor-Ordnung (keine `created_at`/`id`-Spalte auf dieser Zeilentabelle —
 * anders als die generischen Stammdaten-Listen wird hier NICHT
 * `stammdaten/persistence/cursor.util.ts`s `paginate()` wiederverwendet,
 * dessen `CursorableRow`-Vertrag `{createdAt, id}` voraussetzt).
 */
@Injectable()
export class NachweisPreflightRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insertPreflight(input: InsertPreflightInput): Promise<Preflight> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO nachweis.preflight
         (id, foerderjahr_id, profil_code, profil_version, ergebnis, blocker_anzahl, warnung_anzahl, hinweis_anzahl,
          umfang_paare_anzahl, monate_erwartet, synthetic, ausgefuehrt_von_sub)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING ${PREFLIGHT_COLUMNS}`,
      [
        input.id,
        input.foerderjahrId,
        input.profilCode,
        input.profilVersion,
        input.ergebnis,
        input.blockerAnzahl,
        input.warnungAnzahl,
        input.hinweisAnzahl,
        input.umfangPaareAnzahl,
        input.monateErwartet,
        input.synthetic,
        input.ausgefuehrtVonSub,
      ],
    );
    const result = mapOneRow(bindRows<PreflightDbRow>(rawRows), mapPreflightRow);
    if (result === undefined) {
      throw new Error('nachweis.preflight-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }
    return result;
  }

  /** `lfd` wird HIER fortlaufend ab 1 vergeben (Aufrufer sammelt Befunde bereits in der gewünschten Reihenfolge). */
  async insertBefunde(preflightId: string, befunde: readonly InsertBefundInput[]): Promise<void> {
    let lfd = 0;
    for (const befund of befunde) {
      lfd += 1;
      await this.txHost.tx.query(
        `INSERT INTO nachweis.preflight_befund (preflight_id, lfd, regel_code, schwere, endkunde_id, energietraeger, monat, kennzahl_klasse)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8)`,
        [
          preflightId,
          lfd,
          befund.regelCode,
          befund.schwere,
          befund.endkundeId ?? null,
          befund.energietraeger ?? null,
          befund.monat ?? null,
          befund.kennzahlKlasse ?? null,
        ],
      );
    }
  }

  async findById(id: string): Promise<Preflight | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(`SELECT ${PREFLIGHT_COLUMNS} FROM nachweis.preflight WHERE id = $1`, [id]);
    return mapOneRow(bindRows<PreflightDbRow>(rawRows), mapPreflightRow);
  }

  /** Cursor-Pagination über `lfd` (numerisch, opak als String übergeben — `>` statt Keyset-Tupel, `lfd` ist strikt aufsteigend eindeutig je Preflight). */
  async findBefunde(preflightId: string, options: { readonly cursorLfd?: number; readonly limit: number }): Promise<{ readonly daten: PreflightBefund[]; readonly naechsterCursorLfd: number | null }> {
    const params: unknown[] = [preflightId];
    let whereZusatz = '';
    if (options.cursorLfd !== undefined) {
      params.push(options.cursorLfd);
      whereZusatz = `AND lfd > $${String(params.length)}`;
    }
    params.push(options.limit + 1);
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT preflight_id, lfd, regel_code, schwere, endkunde_id, energietraeger, monat, kennzahl_klasse
         FROM nachweis.preflight_befund
        WHERE preflight_id = $1 ${whereZusatz}
        ORDER BY lfd ASC
        LIMIT $${String(params.length)}`,
      params,
    );
    const alle = mapManyRows(bindRows<BefundDbRow>(rawRows), mapBefundRow);
    if (alle.length > options.limit) {
      const daten = alle.slice(0, options.limit);
      const letzter = daten[daten.length - 1];
      return { daten, naechsterCursorLfd: letzter === undefined ? null : letzter.lfd };
    }
    return { daten: alle, naechsterCursorLfd: null };
  }
}
