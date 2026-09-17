import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { INGEST_PG_POOL } from './ingest-pg.module';

interface ForwardLookupRow {
  readonly zaehler_id: string;
}

/**
 * ADR-0005 §26.3/§26.4/§26.6 (D14, O4 "Herzstueck") — der Worker-eigene
 * Vorwaerts-Lookup: Blind-Index → `zaehler_id`. **Ausschliesslich** die vier
 * Spalten, die `edms_ingest_worker` per Grant lesen darf (V0010):
 * `zaehler_id, deveui_blind_index, status, gueltig_bis` — KEIN `SELECT` auf
 * `deveui_enc`/`crypto_key_id` (RL-1, der Worker braucht/kann die
 * Klartext-DevEUI nie lesen).
 *
 * **D-KANON (V0010)** — dasselbe kanonische Aktiv-Praedikat wie der
 * partielle Unique-Index (`ux_geraet_zuordnung_blind_index_aktiv`) und die
 * Shred-Neutralisierung: `status = 'aktiv' AND gueltig_bis IS NULL`.
 *
 * Kein Einzel-Audit-Event fuer diesen Aufruf (ADR-0005 §26.4-Tabelle,
 * "Worker-eigener Vorwaerts-Lookup ... kein Einzel-Event; Metrik/Zaehler
 * statt Audit-Zeile") — der Aufrufer (`IngestFlowService`) erhoeht
 * stattdessen einen aggregierten Zaehler (`IngestMetrics`, SEC-6: KEINE
 * Blind-Index-/Zaehler-ID-Kardinalitaet als Label).
 */
@Injectable()
export class DeviceForwardLookupRepository {
  constructor(@Inject(INGEST_PG_POOL) private readonly pool: Pool) {}

  async findAktivenZaehler(blindIndex: Buffer): Promise<string | undefined> {
    const result = await this.pool.query<ForwardLookupRow>(
      `SELECT zaehler_id
         FROM device.geraet_zuordnung
        WHERE deveui_blind_index = $1
          AND status = 'aktiv'
          AND gueltig_bis IS NULL`,
      [blindIndex],
    );

    return result.rows[0]?.zaehler_id;
  }
}
