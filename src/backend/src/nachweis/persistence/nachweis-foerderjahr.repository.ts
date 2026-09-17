import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import { decodeCursor, encodeCursor } from '../../stammdaten/persistence/cursor.util';
import type { PaginatedResult } from '../../stammdaten/persistence/cursor.util';
import { toIsoDateString } from '../../berechnung/persistence/pg-date.util';

export type FoerderjahrDefinitionQuelle = 'kalenderjahr' | 'bewilligungszeitraum';

export interface Foerderjahr {
  readonly id: string;
  readonly code: string;
  readonly vorhabenRef: string;
  readonly nummer: number;
  readonly vonMonat: string;
  readonly bisMonat: string;
  /** Erster Tag des Foerderjahres (inklusiv) — bei einem Bewilligungszeitraum der Tag aus dem Bescheid. */
  readonly vonTag: string;
  /** Erster Tag NACH dem Foerderjahr (EXKLUSIV) — anders als `bisMonat`, der inklusiv ist. */
  readonly bisTag: string;
  readonly definitionQuelle: FoerderjahrDefinitionQuelle;
  readonly bescheidRef: string | null;
  readonly createdAt: string;
}

interface FoerderjahrDbRow {
  readonly id: string;
  readonly code: string;
  readonly vorhaben_ref: string;
  readonly nummer: number;
  readonly von_monat: unknown;
  readonly bis_monat: unknown;
  readonly von_tag: unknown;
  readonly bis_tag: unknown;
  readonly definition_quelle: string;
  readonly bescheid_ref: string | null;
  readonly created_at: string;
}

function toDefinitionQuelle(value: string): FoerderjahrDefinitionQuelle {
  return value === 'bewilligungszeitraum' ? 'bewilligungszeitraum' : 'kalenderjahr';
}

function mapRow(row: FoerderjahrDbRow): Foerderjahr {
  return {
    id: row.id,
    code: row.code,
    vorhabenRef: row.vorhaben_ref,
    nummer: row.nummer,
    vonMonat: toIsoDateString(row.von_monat),
    bisMonat: toIsoDateString(row.bis_monat),
    vonTag: toIsoDateString(row.von_tag),
    bisTag: toIsoDateString(row.bis_tag),
    definitionQuelle: toDefinitionQuelle(row.definition_quelle),
    bescheidRef: row.bescheid_ref,
    createdAt: row.created_at,
  };
}

const COLUMNS =
  'id, code, vorhaben_ref, nummer, von_monat, bis_monat, von_tag, bis_tag, definition_quelle, bescheid_ref, created_at';

export interface InsertFoerderjahrInput {
  readonly id: string;
  readonly code: string;
  readonly vorhabenRef: string;
  readonly nummer: number;
  /**
   * Die taggenauen Grenzen. `bisTag` ist EXKLUSIV.
   *
   * Die Monatsfelder werden daraus ABGELEITET (die Datenbank prueft das per
   * CHECK, V0070) — sie sind das Etikett, nicht die Wahrheit. Wer nur Monate
   * kennt, uebergibt den Monatsersten und den Ersten des Folgemonats.
   */
  readonly vonTag: string;
  readonly bisTag: string;
  readonly definitionQuelle: FoerderjahrDefinitionQuelle;
  readonly bescheidRef: string | null;
}

/**
 * Das Foerderjahr-Fenster aus einem MONATSBEREICH — `bisMonat` inklusiv, wie
 * er bisher überall verstanden wurde.
 *
 * Sie steht hier, weil die Umrechnung genau eine Falle enthält und niemand
 * sie mehrfach richtig treffen soll: `bisMonat` ist der LETZTE enthaltene
 * Monat, `bisTag` der erste Tag DANACH. Wer beide gleichsetzt, bekommt ein
 * Foerderjahr, das einen Monat zu kurz ist — oder eines, das dreizehn Monate
 * erwartet und zwölf bekommt.
 */
export function fensterAusMonaten(vonMonat: string, bisMonat: string): { vonTag: string; bisTag: string } {
  const [jahr, monat] = bisMonat.split('-').map((x) => Number.parseInt(x, 10));
  const danach = new Date(Date.UTC(jahr ?? 1970, monat ?? 1, 1));
  return { vonTag: vonMonat, bisTag: danach.toISOString().slice(0, 10) };
}

/**
 * `nachweis.foerderjahr` (D4/O1) — append-only Stammdaten-Tabelle (KEIN
 * `updated_at`, KEIN Update-/Delete-Pfad: `edms_app` hat laut V0025-GRANTs
 * nur `INSERT, SELECT`). Owner ist `edms_nachweis_owner`, NICHT `edms_app`
 * (A19-Muster) — ein versehentlicher `UPDATE`/`DELETE`-Versuch schlägt mit
 * `42501` fehl (append-only-Nachweistest, s. Integrationstests).
 */
@Injectable()
export class NachweisFoerderjahrRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertFoerderjahrInput): Promise<Foerderjahr> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO nachweis.foerderjahr
         (id, code, vorhaben_ref, nummer, von_monat, bis_monat, von_tag, bis_tag, definition_quelle, bescheid_ref)
       VALUES ($1, $2, $3, $4,
               date_trunc('month', $5::date)::date,
               date_trunc('month', $6::date - 1)::date,
               $5::date, $6::date, $7, $8)
       RETURNING ${COLUMNS}`,
      [
        input.id,
        input.code,
        input.vorhabenRef,
        input.nummer,
        // Die Monatsfelder rechnet die DATENBANK aus den Tagen aus — so
        // koennen sie nicht auseinanderlaufen, und der Aufrufer muss die
        // Inklusiv/Exklusiv-Falle nicht zweimal richtig treffen.
        input.vonTag,
        input.bisTag,
        input.definitionQuelle,
        input.bescheidRef,
      ],
    );
    const result = mapOneRow(bindRows<FoerderjahrDbRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('nachweis.foerderjahr-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }
    return result;
  }

  async findById(id: string): Promise<Foerderjahr | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(`SELECT ${COLUMNS} FROM nachweis.foerderjahr WHERE id = $1`, [id]);
    return mapOneRow(bindRows<FoerderjahrDbRow>(rawRows), mapRow);
  }

  async findByCode(code: string): Promise<Foerderjahr | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(`SELECT ${COLUMNS} FROM nachweis.foerderjahr WHERE code = $1`, [code]);
    return mapOneRow(bindRows<FoerderjahrDbRow>(rawRows), mapRow);
  }

  async listPage(options: { readonly cursor?: string; readonly limit: number }): Promise<PaginatedResult<Foerderjahr>> {
    const params: unknown[] = [];
    let whereClause = '';
    const decoded = options.cursor !== undefined ? decodeCursor(options.cursor) : undefined;
    if (decoded !== undefined) {
      params.push(decoded.createdAt, decoded.id);
      whereClause = 'WHERE (created_at > $1::timestamptz OR (created_at = $1::timestamptz AND id > $2::uuid))';
    }
    params.push(options.limit + 1);
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${COLUMNS} FROM nachweis.foerderjahr ${whereClause}
        ORDER BY created_at ASC, id ASC
        LIMIT $${String(params.length)}`,
      params,
    );
    const alle = mapManyRows(bindRows<FoerderjahrDbRow>(rawRows), mapRow);
    if (alle.length > options.limit) {
      const daten = alle.slice(0, options.limit);
      const letzter = daten[daten.length - 1];
      const naechsterCursor = letzter === undefined ? null : encodeCursor({ createdAt: letzter.createdAt, id: letzter.id });
      return { daten, naechsterCursor };
    }
    return { daten: alle, naechsterCursor: null };
  }
}
