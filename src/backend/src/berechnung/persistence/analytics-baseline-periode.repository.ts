import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows } from '../../stammdaten/persistence/map-row';
import { toIsoDateString } from './pg-date.util';

/** `energy.baseline_periode` (V0019, additiv) — Baseline-Bezugszeiträume für GTZ_base (ADR-0006 B5/B12.1). */
export interface BaselinePeriode {
  readonly id: string;
  readonly mvetId: string;
  /** ISO `YYYY-MM-DD`. */
  readonly von: string;
  /** ISO `YYYY-MM-DD`, EXKLUSIV (DB-CHECK `bis > von`). */
  readonly bis: string;
  readonly menge: number | null;
  readonly einheit: string | null;
}

interface BaselinePeriodeRow {
  readonly id: string;
  readonly mvet_id: string;
  // `date`-Spalten — s. `pg-date.util.ts`-Kopf-Kommentar (pg liefert HIER
  // ein `Date`-Objekt, lokale Mitternacht, KEIN String).
  readonly von: unknown;
  readonly bis: unknown;
  readonly menge: string | null;
  readonly einheit: string | null;
}

function mapRow(row: BaselinePeriodeRow): BaselinePeriode {
  return {
    id: row.id,
    mvetId: row.mvet_id,
    von: toIsoDateString(row.von),
    bis: toIsoDateString(row.bis),
    menge: row.menge === null ? null : Number.parseFloat(row.menge),
    einheit: row.einheit,
  };
}

@Injectable()
export class AnalyticsBaselinePeriodeRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /** ALLE Baseline-Perioden je `mvetId` (B5: "1-3 Abrechnungszeiträume") — GTZ_base ist der Mittelwert über deren Jahres-GTZ. */
  async listByMvet(mvetId: string): Promise<BaselinePeriode[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT id, mvet_id, von, bis, menge, einheit
         FROM energy.baseline_periode
        WHERE mvet_id = $1
        ORDER BY von ASC`,
      [mvetId],
    );

    return mapManyRows(bindRows<BaselinePeriodeRow>(rawRows), mapRow);
  }
}
