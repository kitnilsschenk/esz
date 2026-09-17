import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';

export interface WiderspruchBelegAnlegenInput {
  readonly id: string;
  readonly widerspruchId: string;
  readonly cryptoKeyId: string;
  readonly art: 'erklaerung' | 'ruecknahme';
  readonly erfassungsweg: string;
  readonly erfasstAt: Date;
  readonly quelleRef?: string | undefined;
  /** Pflicht bei `digital_opt_in` (DS-03), sonst verboten — beides als DB-CHECK (V0069). */
  readonly ipEnc?: Buffer | undefined;
  readonly userAgentEnc?: Buffer | undefined;
}

/**
 * `identity.widerspruch_beleg` (V0069) — der Nachweis zu einem Widerspruch.
 *
 * Nur INSERT: `edms_app` hat kein UPDATE (V0069-GRANTs). Ein Nachweis, den
 * die Anwendung nachträglich korrigieren kann, ist keiner; unlesbar machen
 * darf ihn allein der Shred-/Löschlauf.
 */
@Injectable()
export class WiderspruchBelegRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: WiderspruchBelegAnlegenInput): Promise<void> {
    await this.txHost.tx.query(
      `INSERT INTO identity.widerspruch_beleg
         (id, widerspruch_id, crypto_key_id, art, erfassungsweg, erfasst_at, quelle_ref, ip_enc, user_agent_enc)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.id,
        input.widerspruchId,
        input.cryptoKeyId,
        input.art,
        input.erfassungsweg,
        input.erfasstAt,
        input.quelleRef ?? null,
        input.ipEnc ?? null,
        input.userAgentEnc ?? null,
      ],
    );
  }
}
