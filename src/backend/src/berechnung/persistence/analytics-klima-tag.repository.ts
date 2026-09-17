import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows } from '../../stammdaten/persistence/map-row';
import type { KlimaHerkunft, KlimaTagRohwert, KlimaTagWert } from '../klima/klima-quelle.port';
import { toIsoDateString } from './pg-date.util';

interface KlimaTagRow {
  // `date`-Spalte — s. `pg-date.util.ts`-Kopf-Kommentar (pg liefert HIER ein
  // `Date`-Objekt, lokale Mitternacht, KEIN String). KRITISCH hier: `tag`
  // fließt direkt in Datums-STRING-Vergleiche im Service ein (`zeit.util.ts`).
  readonly tag: unknown;
  readonly t_mittel: string;
}

/**
 * `analytics.klima_tag` — laufender Vorrat, Revisionsachse (V0019 D4:
 * "append-only: neue Revision = neue Zeile, nie Überschreiben — R2: DWD
 * revidiert Werte nachträglich"). `edms_app` hat NUR INSERT/SELECT (Migrations-
 * GRANTs) — kein UPDATE/DELETE-Pfad wird hier gebaut.
 */
@Injectable()
export class AnalyticsKlimaTagRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * Neueste `revision` je Kalendertag (`DISTINCT ON`) — "neueste revision
   * gewinnt" (Arbeitsauftrag). Halboffenes Intervall `[von, bis)`.
   */
  async findTage(stationRef: string, von: string, bis: string): Promise<KlimaTagWert[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT DISTINCT ON (tag) tag, t_mittel
         FROM analytics.klima_tag
        WHERE station_ref = $1 AND tag >= $2::date AND tag < $3::date
        ORDER BY tag ASC, revision DESC`,
      [stationRef, von, bis],
    );

    return mapManyRows(bindRows<KlimaTagRow>(rawRows), (row) => ({
      tag: toIsoDateString(row.tag),
      tMittelC: Number.parseFloat(row.t_mittel),
    }));
  }

  /**
   * Schreibt die Werte EINES Abrufs nach `analytics.klima_tag` — die
   * Revisionsachse aus V0019 D4 ("append-only: neue Revision = neue Zeile,
   * nie Überschreiben — R2: DWD revidiert Werte nachträglich") wird hier
   * gefahren, denn erst mit dem realen Adapter gibt es überhaupt Revisionen:
   *
   *   - Tag noch nicht vorhanden   → `revision = 0`.
   *   - Tag vorhanden, GLEICHER Wert → nichts. Ein erneuter Abruf desselben
   *     Standes ist keine Revision; jede Wiederholung eine Zeile schreiben
   *     zu lassen, machte die Achse unlesbar.
   *   - Tag vorhanden, ANDERER Wert → `revision = max + 1`. Der alte Wert
   *     bleibt stehen: ein Lauf, der ihn verwendet hat, muss nachvollziehbar
   *     bleiben (`REVOKE UPDATE, DELETE` sorgt dafür ohnehin — `edms_app`
   *     hat nur INSERT/SELECT).
   *
   * Idempotent bei gleichzeitigem Lauf: `ON CONFLICT DO NOTHING` auf dem PK
   * fängt das Rennen zweier Prozesse um dieselbe Revisionsnummer ab.
   *
   * @returns Anzahl tatsächlich geschriebener Zeilen (0 = alles war bereits da).
   */
  async insertAbruf(
    stationRef: string,
    werte: readonly KlimaTagRohwert[],
    herkunft: KlimaHerkunft,
  ): Promise<number> {
    let geschrieben = 0;

    for (const wert of werte) {
      const rawRows: unknown = await this.txHost.tx.query(
        `SELECT revision, t_mittel
           FROM analytics.klima_tag
          WHERE station_ref = $1 AND tag = $2::date
          ORDER BY revision DESC
          LIMIT 1`,
        [stationRef, wert.tag],
      );
      const [vorhanden] = bindRows<{ readonly revision: number; readonly t_mittel: string }>(rawRows);

      if (vorhanden !== undefined && Number.parseFloat(vorhanden.t_mittel) === runde2(wert.tMittelC)) {
        continue;
      }

      const revision = vorhanden === undefined ? 0 : Number(vorhanden.revision) + 1;
      const ergebnis: unknown = await this.txHost.tx.query(
        `INSERT INTO analytics.klima_tag
             (station_ref, tag, revision, t_mittel, quelle, datei_version, lizenz_id, qualitaets_niveau)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (station_ref, tag, revision) DO NOTHING
         RETURNING tag`,
        [
          stationRef,
          wert.tag,
          revision,
          wert.tMittelC,
          herkunft.quelle,
          herkunft.dateiVersion,
          herkunft.lizenzId,
          wert.qualitaetsNiveau,
        ],
      );
      geschrieben += bindRows<{ readonly tag: unknown }>(ergebnis).length;
    }

    return geschrieben;
  }
}

/**
 * `t_mittel` ist `numeric(6,2)` — die DB rundet beim Schreiben. Der Vergleich
 * "gleicher Wert?" muss deshalb auf derselben Genauigkeit stattfinden, sonst
 * gälte 9.234 als Revision von gespeicherten 9.23.
 */
function runde2(wert: number): number {
  return Math.round(wert * 100) / 100;
}
