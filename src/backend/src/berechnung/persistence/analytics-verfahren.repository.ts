import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapOneRow } from '../../stammdaten/persistence/map-row';

export interface VerfahrenVersion {
  readonly id: string;
  readonly code: string;
  readonly version: number;
  readonly parameterSchema: unknown;
  readonly goldenVectors: unknown;
}

interface VerfahrenVersionRow {
  readonly id: string;
  readonly code: string;
  readonly version: number;
  readonly parameter_schema: unknown;
  readonly golden_vectors: unknown;
}

/**
 * `analytics.verfahren_version` (B3, SCD2, "gepflegt AUSSCHLIESSLICH über
 * Migrationen" — `edms_app` hat NUR `SELECT`, s. V0019 D-A6-VERFAHREN-REVOKE)
 * — reiner Lesepfad, KEIN Insert/Update-Pfad in diesem Repository.
 */
@Injectable()
export class AnalyticsVerfahrenRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /** Aktive Version je Verfahrenscode (`aktiv=true AND gueltig_bis IS NULL`, SCD2-Konvention). */
  async findAktiveVersion(code: string): Promise<VerfahrenVersion | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT id, code, version, parameter_schema, golden_vectors
         FROM analytics.verfahren_version
        WHERE code = $1 AND aktiv = true AND gueltig_bis IS NULL
        ORDER BY version DESC
        LIMIT 1`,
      [code],
    );

    return mapOneRow(bindRows<VerfahrenVersionRow>(rawRows), (row) => ({
      id: row.id,
      code: row.code,
      version: row.version,
      parameterSchema: row.parameter_schema,
      goldenVectors: row.golden_vectors,
    }));
  }

  /** ALLE aktiven Verfahrensversionen — Basis des `GoldenVectorBootstrapService`-Fail-closed-Checks beim Start. */
  async findAlleAktiven(): Promise<VerfahrenVersion[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT id, code, version, parameter_schema, golden_vectors
         FROM analytics.verfahren_version
        WHERE aktiv = true AND gueltig_bis IS NULL
        ORDER BY code ASC, version ASC`,
      [],
    );

    return bindRows<VerfahrenVersionRow>(rawRows).map((row) => ({
      id: row.id,
      code: row.code,
      version: row.version,
      parameterSchema: row.parameter_schema,
      goldenVectors: row.golden_vectors,
    }));
  }
}
