import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapOneRow } from '../map-row';

/**
 * ADR-0010 D3 — query-basiertes Repository, NUR `energy.zaehler_standort`
 * (temporale Verortung des Zählers, `EXCLUDE`-Overlap-Schutz je `zaehler_id`
 * — dasselbe Muster wie `energy.nutzungsverhaeltnis`/`device.geraet_zuordnung`).
 */
export interface ZaehlerStandortRow {
  readonly id: string;
  readonly zaehler_id: string;
  readonly standort_id: string;
  readonly gueltig_von: string;
  readonly gueltig_bis: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ZaehlerStandort {
  readonly id: string;
  readonly zaehlerId: string;
  readonly standortId: string;
  readonly gueltigVon: string;
  readonly gueltigBis: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function mapRow(row: ZaehlerStandortRow): ZaehlerStandort {
  return {
    id: row.id,
    zaehlerId: row.zaehler_id,
    standortId: row.standort_id,
    gueltigVon: row.gueltig_von,
    gueltigBis: row.gueltig_bis,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = 'id, zaehler_id, standort_id, gueltig_von, gueltig_bis, created_at, updated_at';

export interface InsertZaehlerStandortInput {
  readonly id: string;
  readonly zaehlerId: string;
  readonly standortId: string;
  readonly gueltigVon: string;
}

/** PG-Fehlercode für EXCLUDE-Constraint-Verletzung (zeitlicher Overlap — Contract-409), analog `energy.nutzungsverhaeltnis`. */
export const PG_EXCLUSION_VIOLATION = '23P01';

@Injectable()
export class EnergyZaehlerStandortRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertZaehlerStandortInput): Promise<ZaehlerStandort> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO energy.zaehler_standort (id, zaehler_id, standort_id, gueltig_von)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.zaehlerId, input.standortId, input.gueltigVon],
    );

    const result = mapOneRow(bindRows<ZaehlerStandortRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('energy.zaehler_standort-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findById(id: string): Promise<ZaehlerStandort | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.zaehler_standort WHERE id = $1`,
      [id],
    );

    return mapOneRow(bindRows<ZaehlerStandortRow>(rawRows), mapRow);
  }

  /** Die aktuell OFFENE Verortung dieses Zählers (`gueltig_bis IS NULL`) — höchstens EINE Zeile (D-EXCL). */
  async findAktivByZaehlerId(zaehlerId: string): Promise<ZaehlerStandort | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.zaehler_standort
        WHERE zaehler_id = $1 AND gueltig_bis IS NULL`,
      [zaehlerId],
    );

    return mapOneRow(bindRows<ZaehlerStandortRow>(rawRows), mapRow);
  }

  /** Stilllegen-Vorbedingung D2.6(b): mindestens eine OFFENE Verortung an diesem Standort. */
  async hatOffeneVerortungAmStandort(standortId: string): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT EXISTS (
         SELECT 1 FROM energy.zaehler_standort WHERE standort_id = $1 AND gueltig_bis IS NULL
       ) AS vorhanden`,
      [standortId],
    );
    const row = mapOneRow(bindRows<{ readonly vorhanden: boolean }>(rawRows), (r) => r.vorhanden);
    return row ?? false;
  }

  /** Hart-Löschen-Vorbedingung D2.6: JEDE (auch historische, bereits beendete) Verortung an diesem Standort. */
  async hatJemalsVerortungAmStandort(standortId: string): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT EXISTS (SELECT 1 FROM energy.zaehler_standort WHERE standort_id = $1) AS vorhanden`,
      [standortId],
    );
    const row = mapOneRow(bindRows<{ readonly vorhanden: boolean }>(rawRows), (r) => r.vorhanden);
    return row ?? false;
  }

  /**
   * Setzt `gueltig_bis` NUR, wenn die Verortung noch offen ist
   * (`gueltig_bis IS NULL`) — analog `EnergyNutzungsverhaeltnisRepository.
   * beenden`. Wird sowohl vom expliziten "Verortung beenden"-Endpoint als
   * auch — beim "Umsetzen" (D3) — von `ZaehlerVerortungService.
   * erstelleVerortung()` genutzt, um die offene Vorgänger-Verortung
   * GENAU an der Startzeit der neuen zu schließen (keine Lücke, kein Overlap).
   */
  async beenden(id: string, gueltigBis: string): Promise<ZaehlerStandort | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.zaehler_standort SET gueltig_bis = $2
        WHERE id = $1 AND gueltig_bis IS NULL
        RETURNING ${SELECT_COLUMNS}`,
      [id, gueltigBis],
    );

    return mapOneRow(bindReturningRows<ZaehlerStandortRow>(rawRows), mapRow);
  }

  /** Aktuelle Zähleranzahl je Standort (`zaehlerAnzahl`, ADR-0010 §5 Baum-Response) — EIN Knoten. */
  async countAktivByStandortId(standortId: string): Promise<number> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT count(*)::int AS anzahl FROM energy.zaehler_standort WHERE standort_id = $1 AND gueltig_bis IS NULL`,
      [standortId],
    );
    const row = mapOneRow(bindRows<{ readonly anzahl: number }>(rawRows), (r) => r.anzahl);
    return row ?? 0;
  }

  /**
   * ADR-0006 RL-B1 (Einflussgrößen, B8/B10) — Vorbedingung
   * `EinflussgroesseService.erfassen()`: "an/unter diesem Knoten besteht im
   * angegebenen Zeitraum eine (aktive ODER historisch aktive) Zähler-
   * Verortung". `pfad @> ARRAY[$1]` deckt den GESAMTEN Teilbaum ab
   * (Standort selbst + Nachfahren, analog `findZaehlerUnterKnoten()`) —
   * `tstzrange(...) && tstzrange(...)` prüft Überlappung MIT dem
   * Einflussgrößen-Intervall, NICHT nur den aktuellen Zeitpunkt (eine
   * Einflussgröße kann rückwirkend für einen VERGANGENEN Zeitraum erfasst
   * werden, in dem der Zähler bereits wieder abgehängt ist — `gueltig_bis
   * IS NULL` würde diesen Fall fälschlich ablehnen). Postgres interpretiert
   * ein `NULL`-Bound in `tstzrange(...)` als UNBESCHRÄNKT (offenes Ende) —
   * exakt die Semantik einer offenen Verortung bzw. eines offenen
   * Einflussgrößen-Intervalls.
   */
  async hatVerortungImTeilbaumUndZeitraum(standortId: string, von: string, bis: string | null): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT EXISTS (
         SELECT 1
           FROM energy.zaehler_standort zs
           JOIN energy.standort s ON s.id = zs.standort_id
          WHERE s.pfad @> ARRAY[$1]::uuid[]
            AND tstzrange(zs.gueltig_von, zs.gueltig_bis) && tstzrange($2::timestamptz, $3::timestamptz)
       ) AS vorhanden`,
      [standortId, von, bis],
    );
    const row = mapOneRow(bindRows<{ readonly vorhanden: boolean }>(rawRows), (r) => r.vorhanden);
    return row ?? false;
  }

  /**
   * Batch-Variante von `countAktivByStandortId` für die Baum-Liste (`read:standort`,
   * `EnergyStandortRepository.listByEndkunde`) — EINE Query statt N+1.
   * Liefert nur Standorte MIT mindestens einem aktuell verorteten Zähler.
   */
  async countAktivByStandortIds(standortIds: readonly string[]): Promise<ReadonlyMap<string, number>> {
    if (standortIds.length === 0) {
      return new Map();
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT standort_id, count(*)::int AS anzahl
         FROM energy.zaehler_standort
        WHERE standort_id = ANY($1::uuid[]) AND gueltig_bis IS NULL
        GROUP BY standort_id`,
      [standortIds],
    );

    const rows = bindRows<{ readonly standort_id: string; readonly anzahl: number }>(rawRows);
    return new Map(rows.map((row) => [row.standort_id, row.anzahl]));
  }
}
