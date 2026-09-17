import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapOneRow } from '../map-row';

/**
 * ADR-0008 §20 (D8) — query-basiertes Repository, NUR `identity.*`
 * (Namensraum-Trennung, kein cross-namespace-JOIN, Linie 5). Trägt den
 * Krypto-Shredding-Anker: `key_state='geschreddert'` + entferntes
 * `wrapped_dek` macht ALLE Chiffrate des Subjekts unwiederbringlich (ADR-0008
 * §19, D7).
 */
export interface SubjektSchluesselRow {
  readonly id: string;
  readonly wrapped_dek: Buffer;
  readonly kms_key_id: string;
  readonly alg_version: number;
  readonly key_state: string;
  readonly created_at: string;
  readonly geschreddert_at: string | null;
}

export interface SubjektSchluessel {
  readonly id: string;
  readonly wrappedDek: Buffer;
  readonly kmsKeyId: string;
  readonly algVersion: number;
  readonly keyState: 'aktiv' | 'geschreddert';
  readonly createdAt: string;
  readonly geschreddertAt: string | null;
}

function mapRow(row: SubjektSchluesselRow): SubjektSchluessel {
  return {
    id: row.id,
    wrappedDek: row.wrapped_dek,
    kmsKeyId: row.kms_key_id,
    algVersion: row.alg_version,
    keyState: row.key_state === 'geschreddert' ? 'geschreddert' : 'aktiv',
    createdAt: row.created_at,
    geschreddertAt: row.geschreddert_at,
  };
}

const SELECT_COLUMNS = 'id, wrapped_dek, kms_key_id, alg_version, key_state, created_at, geschreddert_at';

@Injectable()
export class IdentitySubjektSchluesselRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: {
    readonly id: string;
    readonly wrappedDek: Buffer;
    readonly kmsKeyId: string;
    readonly algVersion: number;
  }): Promise<SubjektSchluessel> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO identity.subjekt_schluessel (id, wrapped_dek, kms_key_id, alg_version)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.wrappedDek, input.kmsKeyId, input.algVersion],
    );

    const result = mapOneRow(bindRows<SubjektSchluesselRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('identity.subjekt_schluessel-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findById(id: string): Promise<SubjektSchluessel | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM identity.subjekt_schluessel WHERE id = $1`,
      [id],
    );

    return mapOneRow(bindRows<SubjektSchluesselRow>(rawRows), mapRow);
  }

  /**
   * Krypto-Shredding (Art. 17, ADR-0008 §19): DEK-Vernichtung. IDEMPOTENT —
   * bereits geschredderte Zeilen werden unverändert zurückgegeben (kein
   * zweiter Vernichtungsversuch, kein Fehler).
   */
  async markGeschreddert(id: string): Promise<SubjektSchluessel | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE identity.subjekt_schluessel
          SET key_state = 'geschreddert', wrapped_dek = '\\x00'::bytea, geschreddert_at = now()
        WHERE id = $1 AND key_state <> 'geschreddert'
        RETURNING ${SELECT_COLUMNS}`,
      [id],
    );

    const updated = mapOneRow(bindReturningRows<SubjektSchluesselRow>(rawRows), mapRow);
    if (updated !== undefined) {
      return updated;
    }

    // 0 Zeilen betroffen: entweder bereits geschreddert, oder id existiert
    // nicht — idempotent den aktuellen Zustand nachlesen (kein stiller Fehler).
    return this.findById(id);
  }
}
