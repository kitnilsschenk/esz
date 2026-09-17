import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows } from '../map-row';
import { toIsoDateString, toIsoTimestampString } from '../pg-date.util';

/**
 * ADR-0006 Teil B (B8/B10, `migrations/V0020`) — query-basiertes Repository,
 * NUR `einfluss.befund` (TB-03-Schwellwertüberschreitung, A5). v1-Scope
 * (dieses Arbeitspaket) ist AUSSCHLIESSLICH LESEND — die Schwellwert-
 * ERKENNUNG (INSERT nach `einfluss.befund` + Audit-Event
 * `einflussgroesse.schwellwert.ueberschritten`) ist NICHT Teil dieses
 * Pakets (`tb03_schwellwert` im Katalog noch überall NULL, s. finale Antwort
 * des Arbeitspakets).
 *
 * `einfluss.befund` trägt KEINE `endkunde_id`-Spalte (nur `system_id`) —
 * `findBySystemIds()` bewusst OHNE JOIN nach `energy.system`
 * (Namensraum-Trennung, V0020 D-ROLLE: `edms_einfluss` hat KEIN SELECT-Recht
 * auf `energy.*`, ein Cross-Schema-JOIN würde bei einer künftigen
 * Least-Privilege-Connection dieser Rolle fehlschlagen — TOM-Vorwegnahme,
 * s. Design-Entscheidungen in der finalen Antwort). Die Endkunde->System-Id-
 * Auflösung übernimmt der `EinflussgroesseService` über
 * `EnergySystemRepository.listIdsByEndkunde()` (zwei Roundtrips statt einem
 * JOIN).
 */
export interface EinflussBefundRow {
  readonly id: string;
  readonly system_id: string;
  readonly groesse_code: string;
  readonly zeitraum_von: unknown;
  readonly zeitraum_bis: unknown;
  readonly ueberschreitung_klasse: string;
  readonly erkannt_at: unknown;
}

export type UeberschreitungKlasse = 'schwelle_ueberschritten' | 'deutlich_ueberschritten' | 'stark_ueberschritten';

export interface EinflussBefund {
  readonly id: string;
  readonly systemId: string;
  readonly groesseCode: string;
  readonly zeitraumVon: string;
  readonly zeitraumBis: string;
  readonly ueberschreitungKlasse: UeberschreitungKlasse;
  readonly erkanntAt: string;
}

function toUeberschreitungKlasse(value: string): UeberschreitungKlasse {
  return value === 'deutlich_ueberschritten' || value === 'stark_ueberschritten' ? value : 'schwelle_ueberschritten';
}

function mapRow(row: EinflussBefundRow): EinflussBefund {
  return {
    id: row.id,
    systemId: row.system_id,
    groesseCode: row.groesse_code,
    zeitraumVon: toIsoDateString(row.zeitraum_von),
    zeitraumBis: toIsoDateString(row.zeitraum_bis),
    ueberschreitungKlasse: toUeberschreitungKlasse(row.ueberschreitung_klasse),
    erkanntAt: toIsoTimestampString(row.erkannt_at),
  };
}

const SELECT_COLUMNS = 'id, system_id, groesse_code, zeitraum_von, zeitraum_bis, ueberschreitung_klasse, erkannt_at';

@Injectable()
export class EinflussBefundRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async findBySystemIds(systemIds: readonly string[]): Promise<EinflussBefund[]> {
    if (systemIds.length === 0) {
      return [];
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM einfluss.befund
        WHERE system_id = ANY($1::uuid[])
        ORDER BY zeitraum_von ASC, system_id ASC, groesse_code ASC`,
      [systemIds],
    );

    return mapManyRows(bindRows<EinflussBefundRow>(rawRows), mapRow);
  }
}
