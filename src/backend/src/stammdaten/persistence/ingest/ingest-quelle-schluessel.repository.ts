import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapOneRow } from '../map-row';

/**
 * `ingest.quelle_schluessel` (V0059) — gewrappter DEK je Datenquelle.
 *
 * Strukturell identisch zu `DeviceSchluesselRepository`, aber ein EIGENER
 * Schlüsselraum: Ein Datenquellen-Geheimnis und eine DevEUI haben nichts
 * miteinander zu tun, und ein gemeinsamer Schlüssel hieße, dass die
 * Vernichtung des einen das andere mitnimmt.
 *
 * KEIN `key_state`/Shred wie bei `device.schluessel`: Eine Datenquelle ist
 * kein betroffener Mensch, es gibt kein Art.-17-Verlangen gegen sie. Wird sie
 * entfernt, verschwindet die Zeile — das ist die Vernichtung.
 */
export interface IngestQuelleSchluesselRow {
  readonly id: string;
  readonly wrapped_dek: Buffer;
  readonly kms_key_id: string;
  readonly alg_version: number;
  readonly created_at: string;
}

export interface IngestQuelleSchluessel {
  readonly id: string;
  readonly wrappedDek: Buffer;
  readonly kmsKeyId: string;
  readonly algVersion: number;
  readonly createdAt: string;
}

function mapRow(row: IngestQuelleSchluesselRow): IngestQuelleSchluessel {
  return {
    id: row.id,
    wrappedDek: row.wrapped_dek,
    kmsKeyId: row.kms_key_id,
    algVersion: row.alg_version,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = 'id, wrapped_dek, kms_key_id, alg_version, created_at';

export interface InsertIngestQuelleSchluesselInput {
  readonly id: string;
  readonly wrappedDek: Buffer;
  readonly kmsKeyId: string;
  readonly algVersion: number;
}

@Injectable()
export class IngestQuelleSchluesselRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertIngestQuelleSchluesselInput): Promise<IngestQuelleSchluessel> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO ingest.quelle_schluessel (id, wrapped_dek, kms_key_id, alg_version)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.wrappedDek, input.kmsKeyId, input.algVersion],
    );

    const result = mapOneRow(bindRows<IngestQuelleSchluesselRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('ingest.quelle_schluessel-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }
    return result;
  }

  async findById(id: string): Promise<IngestQuelleSchluessel | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM ingest.quelle_schluessel WHERE id = $1`,
      [id],
    );
    return mapOneRow(bindRows<IngestQuelleSchluesselRow>(rawRows), mapRow);
  }
}
