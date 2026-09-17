import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../map-row';
import { decodeCursor } from '../cursor.util';

/** ADR-0008 §20 (D8) — query-basiertes Repository, NUR `energy.*`. */
export interface SystemRow {
  readonly id: string;
  readonly endkunde_id: string;
  readonly bezeichnung: string;
  readonly systemgrenze: string;
  readonly systembeschreibung: string | null;
  readonly standort_id: string | null;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/** ADR-0008 §12 (V0005) — Betriebs-/Sperrzustand der Messstelle, analog Zähler/Messkanal. */
export type BetriebsStatus = 'aktiv' | 'stillgelegt';

export interface System {
  readonly id: string;
  readonly endkundeId: string;
  readonly bezeichnung: string;
  readonly systemgrenze: string;
  readonly systembeschreibung: string | null;
  /**
   * Standort dieser Berechnungseinheit (V0074). Die Vorlage des
   * Einsparungsnachweises definiert: 1 System = 1 Energietraeger an 1
   * Standort eines Endkunden.
   *
   * NICHT dasselbe wie die Zaehler-Verortung (energy.zaehler_standort):
   * die ist feiner (Raum/Etage) und temporal und sagt, wo ein GERAET
   * haengt. null = nicht erfasst; der Nachweis weist das aus, statt es zu
   * erfinden.
   */
  readonly standortId: string | null;
  readonly status: BetriebsStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toBetriebsStatus(value: string): BetriebsStatus {
  return value === 'stillgelegt' ? 'stillgelegt' : 'aktiv';
}

function mapRow(row: SystemRow): System {
  return {
    id: row.id,
    endkundeId: row.endkunde_id,
    bezeichnung: row.bezeichnung,
    systemgrenze: row.systemgrenze,
    systembeschreibung: row.systembeschreibung,
    standortId: row.standort_id,
    status: toBetriebsStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, endkunde_id, bezeichnung, systemgrenze, systembeschreibung, standort_id, status, created_at, updated_at';

export interface InsertSystemInput {
  readonly id: string;
  readonly endkundeId: string;
  readonly bezeichnung: string;
  readonly systemgrenze: string;
  readonly systembeschreibung: string | null;
  readonly standortId: string | null;
}

export interface UpdateSystemInput {
  readonly bezeichnung?: string;
  readonly systemgrenze?: string;
  readonly systembeschreibung?: string;
  readonly standortId?: string | null;
}

export interface ListSystemOptions {
  readonly cursor?: string;
  readonly limit: number;
  readonly endkundeId?: string;
}

@Injectable()
export class EnergySystemRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertSystemInput): Promise<System> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO energy.system (id, endkunde_id, bezeichnung, systemgrenze, systembeschreibung, standort_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.endkundeId, input.bezeichnung, input.systemgrenze, input.systembeschreibung, input.standortId],
    );

    const result = mapOneRow(bindRows<SystemRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('energy.system-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findById(id: string): Promise<System | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(`SELECT ${SELECT_COLUMNS} FROM energy.system WHERE id = $1`, [
      id,
    ]);

    return mapOneRow(bindRows<SystemRow>(rawRows), mapRow);
  }

  /**
   * ADR-0006 (Einflussgrößen-Befunde, `GET .../endkunden/{id}/einflussgroessen/befunde`) —
   * ALLE System-Ids eines Endkunden, bewusst UNPAGINIERT und OHNE weitere
   * Projektion (nur `id`). `EinflussBefundRepository.findBySystemIds()`
   * nutzt dies STATT eines Cross-Schema-JOINs `einfluss.befund JOIN
   * energy.system` — s. dortigen Klassen-Kommentar (Least-Privilege-
   * Vorwegnahme, V0020 D-ROLLE: `edms_einfluss` hat kein SELECT-Recht auf
   * `energy.*`).
   */
  async listIdsByEndkunde(endkundeId: string): Promise<string[]> {
    const rawRows: unknown = await this.txHost.tx.query(`SELECT id FROM energy.system WHERE endkunde_id = $1`, [
      endkundeId,
    ]);

    return mapManyRows(bindRows<{ readonly id: string }>(rawRows), (r) => r.id);
  }

  async listPage(options: ListSystemOptions): Promise<System[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.endkundeId !== undefined) {
      params.push(options.endkundeId);
      conditions.push(`endkunde_id = $${String(params.length)}::uuid`);
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
      `SELECT ${SELECT_COLUMNS} FROM energy.system ${whereClause}
        ORDER BY created_at ASC, id ASC
        LIMIT $${String(params.length)}`,
      params,
    );

    return mapManyRows(bindRows<SystemRow>(rawRows), mapRow);
  }

  async update(id: string, input: UpdateSystemInput): Promise<System | undefined> {
    const setzungen: string[] = [];
    const werte: unknown[] = [];
    let index = 1;

    if (input.bezeichnung !== undefined) {
      setzungen.push(`bezeichnung = $${String(index)}`);
      werte.push(input.bezeichnung);
      index += 1;
    }
    if (input.systemgrenze !== undefined) {
      setzungen.push(`systemgrenze = $${String(index)}`);
      werte.push(input.systemgrenze);
      index += 1;
    }
    if (input.systembeschreibung !== undefined) {
      setzungen.push(`systembeschreibung = $${String(index)}`);
      werte.push(input.systembeschreibung);
      index += 1;
    }
    if (input.standortId !== undefined) {
      setzungen.push(`standort_id = $${String(index)}`);
      werte.push(input.standortId);
      index += 1;
    }

    if (setzungen.length === 0) {
      return this.findById(id);
    }

    werte.push(id);
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.system SET ${setzungen.join(', ')}
        WHERE id = $${String(index)}
        RETURNING ${SELECT_COLUMNS}`,
      werte,
    );

    return mapOneRow(bindReturningRows<SystemRow>(rawRows), mapRow);
  }

  /** IDEMPOTENT — kein Hard-Delete (Linie 3), analog `EnergyZaehlerRepository.stilllegen`. */
  async stilllegen(id: string): Promise<System | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.system SET status = 'stillgelegt'
        WHERE id = $1 AND status <> 'stillgelegt'
        RETURNING ${SELECT_COLUMNS}`,
      [id],
    );

    const updated = mapOneRow(bindReturningRows<SystemRow>(rawRows), mapRow);
    if (updated !== undefined) {
      return updated;
    }

    return this.findById(id);
  }
}
