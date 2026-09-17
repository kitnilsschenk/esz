import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapOneRow } from '../map-row';

/**
 * ADR-0005 §26.2/§26.5 (D14, O4 Vorgabe-Punkt 1/5) — query-basiertes
 * Repository, NUR `device.schluessel` (Namensraum-Trennung, kein
 * cross-namespace-JOIN, V0002 rote Linie 5, fortgeschrieben ADR-0005 §26.1).
 * STRUKTURELL identisch zu `IdentitySubjektSchluesselRepository`
 * (ADR-0008 §20), aber ein EIGENER, dedizierter Schluesselraum
 * (§26.2 — bewusst dupliziert, kein gemeinsamer Cross-Namespace-Zugriff).
 * Traegt den Krypto-Shredding-Anker fuer die Geraete-Dimension:
 * `key_state='geschreddert'` + entferntes `wrapped_dek` macht `deveui_enc`
 * ALLER Zuordnungs-Zeilen, die diesen Schluessel nutzen, unwiederbringlich.
 */
export interface DeviceSchluesselRow {
  readonly id: string;
  readonly wrapped_dek: Buffer;
  readonly kms_key_id: string;
  readonly alg_version: number;
  readonly key_state: string;
  readonly created_at: string;
  readonly geschreddert_at: string | null;
}

export interface DeviceSchluessel {
  readonly id: string;
  readonly wrappedDek: Buffer;
  readonly kmsKeyId: string;
  readonly algVersion: number;
  readonly keyState: 'aktiv' | 'geschreddert';
  readonly createdAt: string;
  readonly geschreddertAt: string | null;
}

function mapRow(row: DeviceSchluesselRow): DeviceSchluessel {
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

export interface InsertDeviceSchluesselInput {
  readonly id: string;
  readonly wrappedDek: Buffer;
  readonly kmsKeyId: string;
  readonly algVersion: number;
}

@Injectable()
export class DeviceSchluesselRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertDeviceSchluesselInput): Promise<DeviceSchluessel> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO device.schluessel (id, wrapped_dek, kms_key_id, alg_version)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.wrappedDek, input.kmsKeyId, input.algVersion],
    );

    const result = mapOneRow(bindRows<DeviceSchluesselRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('device.schluessel-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findById(id: string): Promise<DeviceSchluessel | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(`SELECT ${SELECT_COLUMNS} FROM device.schluessel WHERE id = $1`, [
      id,
    ]);

    return mapOneRow(bindRows<DeviceSchluesselRow>(rawRows), mapRow);
  }

  /**
   * Krypto-Shredding (Art. 17, ADR-0005 §26.5): DEK-Vernichtung. IDEMPOTENT —
   * bereits geschredderte Zeilen werden unveraendert zurueckgegeben (kein
   * zweiter Vernichtungsversuch, kein Fehler) — analog
   * `IdentitySubjektSchluesselRepository.markGeschreddert`.
   */
  async markGeschreddert(id: string): Promise<DeviceSchluessel | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE device.schluessel
          SET key_state = 'geschreddert', wrapped_dek = '\\x00'::bytea, geschreddert_at = now()
        WHERE id = $1 AND key_state <> 'geschreddert'
        RETURNING ${SELECT_COLUMNS}`,
      [id],
    );

    const updated = mapOneRow(bindReturningRows<DeviceSchluesselRow>(rawRows), mapRow);
    if (updated !== undefined) {
      return updated;
    }

    // 0 Zeilen betroffen: entweder bereits geschreddert, oder id existiert
    // nicht — idempotent den aktuellen Zustand nachlesen (kein stiller Fehler).
    return this.findById(id);
  }
}
