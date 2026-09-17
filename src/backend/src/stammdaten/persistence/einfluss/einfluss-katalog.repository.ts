import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapOneRow } from '../map-row';

/**
 * ADR-0006 Teil B (B8/B10, `migrations/V0020`) — query-basiertes Repository,
 * NUR `einfluss.katalog` (governter, geschlossener Katalog, FÜNF Codes
 * geseedet — `nutzungszweck`/`energietraeger_mix`/`personenanzahl`/
 * `nutzflaeche`/`geraeteabschaffung`, V0020 D-KATALOG-SEED). `edms_einfluss`
 * hat NUR `SELECT` (V0020 GRANTS: "kein INSERT/UPDATE zur Laufzeit") — dieses
 * Repository ist daher bewusst LESE-ONLY.
 *
 * `tb03_schwellwert` wird HIER bewusst NICHT gemappt/verwendet (Scope-Grenze
 * dieses Pakets, s. finale Antwort des Arbeitspakets "Einflussgrößen-
 * Backend" — die Spalte ist im Katalog aktuell überall `NULL`, TB-03-
 * Schwellwerte sind noch nicht final durch `compliance-director` bestätigt).
 */
export interface EinflussKatalogRow {
  readonly code: string;
  readonly wert_art: string;
  readonly einheit: string | null;
  readonly aktiv: boolean;
  readonly created_at: string;
}

export type EinflussWertArt = 'numerisch' | 'codiert';

export interface EinflussKatalog {
  readonly code: string;
  readonly wertArt: EinflussWertArt;
  readonly einheit: string | null;
  readonly aktiv: boolean;
  readonly createdAt: string;
}

function toWertArt(value: string): EinflussWertArt {
  return value === 'numerisch' ? 'numerisch' : 'codiert';
}

function mapRow(row: EinflussKatalogRow): EinflussKatalog {
  return {
    code: row.code,
    wertArt: toWertArt(row.wert_art),
    einheit: row.einheit,
    aktiv: row.aktiv,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = 'code, wert_art, einheit, aktiv, created_at';

@Injectable()
export class EinflussKatalogRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async findByCode(code: string): Promise<EinflussKatalog | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM einfluss.katalog WHERE code = $1`,
      [code],
    );

    return mapOneRow(bindRows<EinflussKatalogRow>(rawRows), mapRow);
  }
}
