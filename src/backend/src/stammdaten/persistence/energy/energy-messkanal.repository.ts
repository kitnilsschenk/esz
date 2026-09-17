import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../map-row';
import { decodeCursor } from '../cursor.util';

/**
 * ADR-0008 §20 (D8) — query-basiertes Repository, NUR `energy.*`.
 * `kanal_key` (internes Integer-Hypertable-Surrogat) wird NIEMALS
 * exponiert/selektiert (§12) — Außenschlüssel ist ausschließlich `id` (UUID).
 */
export interface MesskanalRow {
  readonly id: string;
  readonly zaehler_id: string;
  readonly messgroesse: string;
  readonly einheit: string;
  readonly art: string;
  readonly status: string;
  readonly obis_kennzahl: string | null;
  readonly ist_untermessung: boolean;
  readonly richtung: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export type MessgroesseArt = 'kumulativ_zaehlerstand' | 'intervall_verbrauch';

/**
 * Energierichtung des Messpunkts (V0074).
 *
 * Der Einsparungsnachweis rechnet `Ist-Verbrauch = Σ bezug + eigenerzeugung
 * − einspeisung` ([Q3] Kap. 9). Ohne die Unterscheidung stand die Angabe nur
 * als Freitext in der Systemgrenze — und eine Prosa-Angabe kann keine Bilanz
 * rechnen.
 */
export type Messrichtung = 'bezug' | 'eigenerzeugung' | 'einspeisung';

export const MESSRICHTUNG_WERTE: readonly Messrichtung[] = ['bezug', 'eigenerzeugung', 'einspeisung'];
export type BetriebsStatus = 'aktiv' | 'stillgelegt';

export interface Messkanal {
  readonly id: string;
  readonly zaehlerId: string;
  readonly messgroesse: string;
  readonly einheit: string;
  readonly art: MessgroesseArt;
  readonly status: BetriebsStatus;
  readonly obisKennzahl: string | null;
  /**
   * `true` = dieser Kanal misst eine TEILMENGE dessen, was ein anderer Kanal
   * desselben Systems bereits erfasst (V0058). Die Einsparberechnung laesst
   * solche Kanaele aus, sonst zaehlte sie denselben Verbrauch mehrfach.
   */
  readonly istUntermessung: boolean;
  /**
   * Bezug, Eigenerzeugung oder Einspeisung (V0074). Default `bezug` ist eine
   * ANNAHME ueber Bestandskanaele, keine Messung — ein faelschlich als
   * `bezug` gefuehrter Einspeisekanal erhoeht den ausgewiesenen Verbrauch
   * und senkt die Einsparung.
   */
  readonly richtung: Messrichtung;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toArt(value: string): MessgroesseArt {
  return value === 'intervall_verbrauch' ? 'intervall_verbrauch' : 'kumulativ_zaehlerstand';
}

function toRichtung(value: string): Messrichtung {
  return MESSRICHTUNG_WERTE.find((kandidat) => kandidat === value) ?? 'bezug';
}

function toStatus(value: string): BetriebsStatus {
  return value === 'stillgelegt' ? 'stillgelegt' : 'aktiv';
}

function mapRow(row: MesskanalRow): Messkanal {
  return {
    id: row.id,
    zaehlerId: row.zaehler_id,
    messgroesse: row.messgroesse,
    einheit: row.einheit,
    art: toArt(row.art),
    status: toStatus(row.status),
    obisKennzahl: row.obis_kennzahl,
    istUntermessung: row.ist_untermessung,
    richtung: toRichtung(row.richtung),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, zaehler_id, messgroesse, einheit, art, status, obis_kennzahl, ist_untermessung, richtung, created_at, updated_at';

export interface InsertMesskanalInput {
  readonly id: string;
  readonly zaehlerId: string;
  readonly messgroesse: string;
  readonly einheit: string;
  readonly art: MessgroesseArt;
  readonly obisKennzahl: string | null;
  readonly istUntermessung: boolean;
  readonly richtung: Messrichtung;
}

export interface UpdateMesskanalInput {
  readonly einheit?: string;
  readonly obisKennzahl?: string | null;
  readonly istUntermessung?: boolean;
  readonly richtung?: Messrichtung;
}

export interface ListMesskanalOptions {
  readonly cursor?: string;
  readonly limit: number;
  readonly zaehlerId?: string;
}

/** PG-Fehlercode für UNIQUE-Verletzung (Doppelanlage — Contract-409). */
export const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class EnergyMesskanalRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertMesskanalInput): Promise<Messkanal> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO energy.messkanal (id, zaehler_id, messgroesse, einheit, art, obis_kennzahl, ist_untermessung, richtung)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.id,
        input.zaehlerId,
        input.messgroesse,
        input.einheit,
        input.art,
        input.obisKennzahl,
        input.istUntermessung,
        input.richtung,
      ],
    );

    const result = mapOneRow(bindRows<MesskanalRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('energy.messkanal-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findById(id: string): Promise<Messkanal | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.messkanal WHERE id = $1`,
      [id],
    );

    return mapOneRow(bindRows<MesskanalRow>(rawRows), mapRow);
  }

  async listPage(options: ListMesskanalOptions): Promise<Messkanal[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.zaehlerId !== undefined) {
      params.push(options.zaehlerId);
      conditions.push(`zaehler_id = $${String(params.length)}::uuid`);
    }

    const decoded = options.cursor !== undefined ? decodeCursor(options.cursor) : undefined;
    if (decoded !== undefined) {
      params.push(decoded.createdAt, decoded.id);
      const idxA = params.length - 1;
      const idxB = params.length;
      conditions.push(
        `(created_at > $${String(idxA)}::timestamptz OR (created_at = $${String(idxA)}::timestamptz AND id > $${String(idxB)}::uuid))`,
      );
    }

    params.push(options.limit + 1);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.messkanal ${whereClause}
        ORDER BY created_at ASC, id ASC
        LIMIT $${String(params.length)}`,
      params,
    );

    return mapManyRows(bindRows<MesskanalRow>(rawRows), mapRow);
  }

  async update(id: string, input: UpdateMesskanalInput): Promise<Messkanal | undefined> {
    const setzungen: string[] = [];
    const werte: unknown[] = [];
    let index = 1;

    if (input.einheit !== undefined) {
      setzungen.push(`einheit = $${String(index)}`);
      werte.push(input.einheit);
      index += 1;
    }
    if (input.obisKennzahl !== undefined) {
      setzungen.push(`obis_kennzahl = $${String(index)}`);
      werte.push(input.obisKennzahl);
      index += 1;
    }
    if (input.istUntermessung !== undefined) {
      setzungen.push(`ist_untermessung = $${String(index)}`);
      werte.push(input.istUntermessung);
      index += 1;
    }
    if (input.richtung !== undefined) {
      setzungen.push(`richtung = $${String(index)}`);
      werte.push(input.richtung);
      index += 1;
    }

    if (setzungen.length === 0) {
      return this.findById(id);
    }

    werte.push(id);
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.messkanal SET ${setzungen.join(', ')}
        WHERE id = $${String(index)}
        RETURNING ${SELECT_COLUMNS}`,
      werte,
    );

    return mapOneRow(bindReturningRows<MesskanalRow>(rawRows), mapRow);
  }

  /** IDEMPOTENT — kein Hard-Delete (Linie 3). */
  async stilllegen(id: string): Promise<Messkanal | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.messkanal SET status = 'stillgelegt'
        WHERE id = $1 AND status <> 'stillgelegt'
        RETURNING ${SELECT_COLUMNS}`,
      [id],
    );

    const updated = mapOneRow(bindReturningRows<MesskanalRow>(rawRows), mapRow);
    if (updated !== undefined) {
      return updated;
    }

    return this.findById(id);
  }
}
