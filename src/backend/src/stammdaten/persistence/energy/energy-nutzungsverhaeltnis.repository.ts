import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../map-row';
import { decodeCursor } from '../cursor.util';

/**
 * ADR-0008 §20 (D8) — query-basiertes Repository, NUR `energy.*`. DS-07-
 * Beziehung (Endkunde↔Anschlussnutzer↔System) + ABAC-Steuergrößen
 * (`datenklasse`, s. `StammdatenResourceAttributesProvider`, §15/Finding A).
 */
export interface NutzungsverhaeltnisRow {
  readonly id: string;
  readonly endkunde_id: string;
  readonly anschlussnutzer_id: string;
  readonly system_id: string;
  readonly datenklasse: string;
  readonly rolle: string;
  readonly gueltig_von: string;
  readonly gueltig_bis: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export type Datenklasse = 'abrechnungsminimum' | 'detailverbrauch';
export type NutzungsRolle = 'mieter' | 'eigentuemer_selbstnutzer' | 'gewerbe_nutzer' | 'sonstige';

export interface Nutzungsverhaeltnis {
  readonly id: string;
  readonly endkundeId: string;
  readonly anschlussnutzerId: string;
  readonly systemId: string;
  readonly datenklasse: Datenklasse;
  readonly rolle: NutzungsRolle;
  readonly gueltigVon: string;
  readonly gueltigBis: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toDatenklasse(value: string): Datenklasse {
  return value === 'detailverbrauch' ? 'detailverbrauch' : 'abrechnungsminimum';
}

function toRolle(value: string): NutzungsRolle {
  if (value === 'mieter' || value === 'gewerbe_nutzer' || value === 'sonstige') {
    return value;
  }
  return 'eigentuemer_selbstnutzer';
}

function mapRow(row: NutzungsverhaeltnisRow): Nutzungsverhaeltnis {
  return {
    id: row.id,
    endkundeId: row.endkunde_id,
    anschlussnutzerId: row.anschlussnutzer_id,
    systemId: row.system_id,
    datenklasse: toDatenklasse(row.datenklasse),
    rolle: toRolle(row.rolle),
    gueltigVon: row.gueltig_von,
    gueltigBis: row.gueltig_bis,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, endkunde_id, anschlussnutzer_id, system_id, datenklasse, rolle, gueltig_von, gueltig_bis, created_at, updated_at';

export interface InsertNutzungsverhaeltnisInput {
  readonly id: string;
  readonly endkundeId: string;
  readonly anschlussnutzerId: string;
  readonly systemId: string;
  readonly datenklasse: Datenklasse;
  readonly rolle: NutzungsRolle;
  readonly gueltigVon: string;
}

export interface ListNutzungsverhaeltnisOptions {
  readonly cursor?: string;
  readonly limit: number;
  readonly endkundeId?: string;
  readonly anschlussnutzerId?: string;
  readonly systemId?: string;
  readonly nurAktuelle?: boolean;
}

/** PG-Fehlercode für EXCLUDE-Constraint-Verletzung (zeitlicher Overlap — Contract-409). */
export const PG_EXCLUSION_VIOLATION = '23P01';

@Injectable()
export class EnergyNutzungsverhaeltnisRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertNutzungsverhaeltnisInput): Promise<Nutzungsverhaeltnis> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO energy.nutzungsverhaeltnis
         (id, endkunde_id, anschlussnutzer_id, system_id, datenklasse, rolle, gueltig_von)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.endkundeId, input.anschlussnutzerId, input.systemId, input.datenklasse, input.rolle, input.gueltigVon],
    );

    const result = mapOneRow(bindRows<NutzungsverhaeltnisRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('energy.nutzungsverhaeltnis-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findById(id: string): Promise<Nutzungsverhaeltnis | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.nutzungsverhaeltnis WHERE id = $1`,
      [id],
    );

    return mapOneRow(bindRows<NutzungsverhaeltnisRow>(rawRows), mapRow);
  }

  async listPage(options: ListNutzungsverhaeltnisOptions): Promise<Nutzungsverhaeltnis[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.endkundeId !== undefined) {
      params.push(options.endkundeId);
      conditions.push(`endkunde_id = $${String(params.length)}::uuid`);
    }
    if (options.anschlussnutzerId !== undefined) {
      params.push(options.anschlussnutzerId);
      conditions.push(`anschlussnutzer_id = $${String(params.length)}::uuid`);
    }
    if (options.systemId !== undefined) {
      params.push(options.systemId);
      conditions.push(`system_id = $${String(params.length)}::uuid`);
    }
    if (options.nurAktuelle === true) {
      conditions.push('gueltig_bis IS NULL');
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
      `SELECT ${SELECT_COLUMNS} FROM energy.nutzungsverhaeltnis ${whereClause}
        ORDER BY created_at ASC, id ASC
        LIMIT $${String(params.length)}`,
      params,
    );

    return mapManyRows(bindRows<NutzungsverhaeltnisRow>(rawRows), mapRow);
  }

  /**
   * Setzt `gueltig_bis` NUR, wenn die Beziehung noch aktuell ist
   * (`gueltig_bis IS NULL`) — der Service entscheidet über Idempotenz
   * (derselbe Endzeitpunkt = idempotenter Erfolg, ein ABWEICHENDER
   * Endzeitpunkt auf einer bereits beendeten Beziehung = Konflikt).
   */
  async beenden(id: string, gueltigBis: string): Promise<Nutzungsverhaeltnis | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.nutzungsverhaeltnis SET gueltig_bis = $2
        WHERE id = $1 AND gueltig_bis IS NULL
        RETURNING ${SELECT_COLUMNS}`,
      [id, gueltigBis],
    );

    return mapOneRow(bindReturningRows<NutzungsverhaeltnisRow>(rawRows), mapRow);
  }

  /**
   * ADR-0008 §15 (D3, Finding A) — der Provider fragt GENAU diese Form
   * (`WHERE system_id=? AND gueltig_bis IS NULL`), die laut EXCLUDE-
   * Constraint (nur je `(anschlussnutzer_id, system_id)` eindeutig) MEHRERE
   * Zeilen liefern KANN (mehrere Anschlussnutzer an derselben Messstelle) —
   * der Aufrufer (Provider) MUSS das fail-closed behandeln, KEIN stilles
   * `LIMIT 1`.
   */
  async findAktuelleFuerSystem(systemId: string): Promise<Nutzungsverhaeltnis[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.nutzungsverhaeltnis WHERE system_id = $1 AND gueltig_bis IS NULL`,
      [systemId],
    );

    return mapManyRows(bindRows<NutzungsverhaeltnisRow>(rawRows), mapRow);
  }

  /** Analog `findAktuelleFuerSystem`, auf Endkunde-Ebene (kann ebenfalls >1 Zeile liefern). */
  async findAktuelleFuerEndkunde(endkundeId: string): Promise<Nutzungsverhaeltnis[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.nutzungsverhaeltnis WHERE endkunde_id = $1 AND gueltig_bis IS NULL`,
      [endkundeId],
    );

    return mapManyRows(bindRows<NutzungsverhaeltnisRow>(rawRows), mapRow);
  }
}
