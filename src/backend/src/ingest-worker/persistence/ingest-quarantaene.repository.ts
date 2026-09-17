import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { INGEST_PG_POOL } from './ingest-pg.module';
import type { IngestReasonCode } from '../ingest-flow/reason-code';

/**
 * Genau EINE der beiden Formen (D-QUAR-SPALTEN/SEC-1, V0011
 * `ck_quarantaene_payload_vorhanden`):
 *   - `redacted`: fuer alle Reason-Codes AUSSER `envelope_parse_fehler` — ein
 *     bereits geparstes, DevEUI-freies (feldbasiert redigiertes) JSON-Objekt.
 *   - `secOne`: NUR fuer `envelope_parse_fehler` (SEC-1) — KEINE Rohpayload,
 *     nur Byte-Laenge + SHA-256-Hash der Rohbytes.
 */
export type QuarantaenePayload =
  | { readonly art: 'redacted'; readonly rohpayloadRedacted: Readonly<Record<string, unknown>> }
  | { readonly art: 'secOne'; readonly payloadLaenge: number; readonly payloadHash: Buffer };

export interface QuarantaeneInsertInput {
  readonly grund: IngestReasonCode;
  readonly topicRedacted: string;
  readonly payload: QuarantaenePayload;
  readonly zaehlerId?: string;
  readonly messkanalKey?: number;
  /** NIEMALS die Klartext-DevEUI (RL-2) — nur der deterministische Blind-Index. */
  readonly deveuiBlindIndex?: Buffer;
  /** Welcher Worker-Prozess die Nachricht empfangen hat (ADR-0011 D8). */
  readonly quelleCode?: string;
  /** Opake Netzserver-Kennungen — NUR IDs, keine Namen (ADR-0011 D1). */
  readonly chirpstackTenantId?: string;
  readonly chirpstackApplicationId?: string;
}

/**
 * ADR-0005 §25 (D13) — Dead-Letter-Schreibpfad. Jeder Ablehnungsfall
 * schreibt GENAU EINE Zeile, nie eine stille Verwerfung (S3a). RL-2: NIE die
 * Klartext-DevEUI — hoechstens den Blind-Index (Wiedererkennung "gleiche
 * fehlerhafte Quelle").
 */
@Injectable()
export class IngestQuarantaeneRepository {
  constructor(@Inject(INGEST_PG_POOL) private readonly pool: Pool) {}

  async insert(input: QuarantaeneInsertInput): Promise<void> {
    const rohpayloadRedacted = input.payload.art === 'redacted' ? input.payload.rohpayloadRedacted : null;
    const payloadLaenge = input.payload.art === 'secOne' ? input.payload.payloadLaenge : null;
    const payloadHash = input.payload.art === 'secOne' ? input.payload.payloadHash : null;

    await this.pool.query(
      `INSERT INTO ingest.eingang_quarantaene
         (id, grund, zaehler_id, messkanal_key, deveui_blind_index, rohpayload_redacted, payload_laenge, payload_hash, topic_redacted,
          quelle_code, chirpstack_tenant_id, chirpstack_application_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        randomUUID(),
        input.grund,
        input.zaehlerId ?? null,
        input.messkanalKey ?? null,
        input.deveuiBlindIndex ?? null,
        rohpayloadRedacted,
        payloadLaenge,
        payloadHash,
        input.topicRedacted,
        input.quelleCode ?? null,
        input.chirpstackTenantId ?? null,
        input.chirpstackApplicationId ?? null,
      ],
    );
  }
}
