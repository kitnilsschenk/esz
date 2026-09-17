import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { INGEST_PG_POOL } from './ingest-pg.module';

interface ZaehlerGeraetetypRow {
  readonly geraetetyp: string;
}

interface MesskanalRow {
  readonly kanal_key: number;
  readonly einheit: string;
  readonly art: string;
}

export interface AktiverMesskanal {
  readonly kanalKey: number;
  readonly einheit: string;
  readonly art: 'kumulativ_zaehlerstand' | 'intervall_verbrauch';
}

function toArt(value: string): AktiverMesskanal['art'] {
  return value === 'intervall_verbrauch' ? 'intervall_verbrauch' : 'kumulativ_zaehlerstand';
}

/**
 * ADR-0005 §20 Schritte 5+7 (D-GRANT-ERW, V0010) — Stammdaten-Lesezugriff,
 * OHNE den ist der Ingest-Flow strukturell nicht ausfuehrbar. `energy.*`
 * ist seit V0002 PII-frei (rote Linie 1) — kein Namensraum-Bruch.
 * `zaehler_id`/`messkanal.zaehler_id` sind LOGISCHE Verweise (kein FK,
 * V0002-Konvention) — diese Klasse validiert nicht zusaetzlich, ob der
 * `zaehlerId` selbst existiert; ein fehlender Treffer (leeres Ergebnis)
 * wird vom Aufrufer als "Auflösung fehlgeschlagen" behandelt (kein Crash).
 */
@Injectable()
export class EnergyStammdatenLookupRepository {
  constructor(@Inject(INGEST_PG_POOL) private readonly pool: Pool) {}

  async findGeraetetyp(zaehlerId: string): Promise<string | undefined> {
    const result = await this.pool.query<ZaehlerGeraetetypRow>(
      `SELECT geraetetyp FROM energy.zaehler WHERE id = $1`,
      [zaehlerId],
    );

    return result.rows[0]?.geraetetyp;
  }

  /**
   * `(zaehler_id, messgroesse, obis_kennzahl)` → `kanal_key` (nutzt die
   * bestehende `UNIQUE(zaehler_id, messgroesse, obis_kennzahl)`, V0002).
   * `IS NOT DISTINCT FROM` statt `=`, weil `obis_kennzahl` NULL sein kann
   * (nur Strom traegt eine OBIS-Kennzahl) — `NULL = NULL` waere sonst immer
   * `false` (SQL-Dreiwertlogik) und faende den Kanal nie.
   * `status = 'aktiv'`: ein stillgelegter Kanal nimmt keine neuen Werte
   * mehr auf (Entscheidung, s. Auslieferungsbericht).
   */
  async findAktivenMesskanal(
    zaehlerId: string,
    messgroesse: string,
    obisKennzahl: string | undefined,
  ): Promise<AktiverMesskanal | undefined> {
    const result = await this.pool.query<MesskanalRow>(
      `SELECT kanal_key, einheit, art
         FROM energy.messkanal
        WHERE zaehler_id = $1
          AND messgroesse = $2
          AND obis_kennzahl IS NOT DISTINCT FROM $3
          AND status = 'aktiv'`,
      [zaehlerId, messgroesse, obisKennzahl ?? null],
    );

    const row = result.rows[0];
    if (row === undefined) {
      return undefined;
    }

    return { kanalKey: row.kanal_key, einheit: row.einheit, art: toArt(row.art) };
  }
}
