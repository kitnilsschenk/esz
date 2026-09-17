import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';

/**
 * Wie viele Messkanäle ein Durchgang höchstens anfasst.
 *
 * `.claude/rules/database-migrations.md` verbietet Datenkopien ohne
 * Batch-Grenze — und genau das ist die Verdichtung: eine Kopie in gröberer
 * Auflösung. Fünfzig Kanäle über ein Tagesfenster sind bei
 * 15-Minuten-Werten rund 4.800 Rohzeilen; das hält keine Sperre spürbar
 * lange auf `measurement.messwert`, gegen die gleichzeitig der Ingest
 * schreibt.
 *
 * Der Aufrufer wiederholt, bis kein Kanal mehr zurückkommt.
 */
export const KANAL_BATCH = 50;

/**
 * Die Rechenvorschrift für den Tageswert — **wörtlich gespiegelt** von
 * `berechnung/persistence/analytics-messwert-monat.repository.ts#berechneTagesaggregation`.
 *
 * Das ist keine Bequemlichkeit, sondern die tragende Eigenschaft dieses
 * Repositories: Nach dem Stufe-A-`drop_chunks` ist der Tagesbestand der
 * einzige verbliebene Zeuge. Weicht er von dem ab, was die Berechnung aus
 * denselben Rohwerten gebildet hat, widerspricht er dem eingereichten
 * Nachweis — und niemand kann den Unterschied noch aufklären, weil die
 * Rohwerte fort sind.
 *
 * Übernommen, Stück für Stück:
 *
 *   * **Lokaler Kalendertag** über `date_trunc('day', ts AT TIME ZONE <tz>)`,
 *     bewusst NICHT `time_bucket(..., timezone => ...)` (ADR-0006 D4 —
 *     Timescale-Lizenzgrenze, `.claude/rules/dependencies.md`).
 *   * **Vorlauf-Zeile** je Kanal: der letzte Wert VOR dem Fenster. Ohne ihn
 *     wäre die Differenz des ersten Rohwerts im Fenster fälschlich `NULL`,
 *     und der erste Tag fiele still aus.
 *   * **`intervall_verbrauch`** → der Wert selbst;
 *     **`kumulativ_zaehlerstand`** → die Differenz zum Vorwert, `NULL` bei
 *     fehlendem Vorwert oder negativer Differenz (Zählerwechsel/-überlauf).
 *   * **`HAVING sum(verbrauch) IS NOT NULL`** — Tage ohne gültige Differenz
 *     werden NIE als 0-kWh-Zeile geschrieben. Eine 0 behauptet „nichts
 *     verbraucht"; die Wahrheit ist „nicht ermittelbar", und das sind zwei
 *     verschiedene Aussagen im Nachweis.
 *   * **`qualitaet_min`** als WORST-Case über den Tag, damit ein einzelner
 *     Ersatzwert den Tag nicht besser aussehen lässt, als er ist.
 *
 * **Eine bewusste Abweichung**, die dokumentiert gehört: Die Berechnung
 * filtert `messkanal.status = 'aktiv'`, dieses Repository **nicht**. Ein
 * stillgelegter Kanal hat weiter Rohwerte aus seiner aktiven Zeit, und die
 * müssen vor dem `drop_chunks` verdichtet werden — sonst verlöre gerade der
 * Bestand seine Nachweisgranularität, den niemand mehr im Blick hat.
 */
const AGGREGAT_CTE = `
  WITH kanaele AS (
    SELECT kanal_key, art
      FROM energy.messkanal
     WHERE kanal_key = ANY($1::int[])
  ),
  grenzen AS (
    SELECT (($2::date)::timestamp AT TIME ZONE $4::text) AS von_ts,
           (($3::date)::timestamp AT TIME ZONE $4::text) AS bis_ts
  ),
  fenster AS (
    SELECT mw.messkanal_key, mw.ts, mw.wert, mw.qualitaet, mw.herkunft
      FROM measurement.messwert mw
      JOIN kanaele k ON k.kanal_key = mw.messkanal_key
     CROSS JOIN grenzen g
     WHERE mw.ts >= g.von_ts AND mw.ts < g.bis_ts
    UNION ALL
    SELECT vor.messkanal_key, vor.ts, vor.wert, vor.qualitaet, vor.herkunft
      FROM (
        SELECT DISTINCT ON (mw.messkanal_key) mw.messkanal_key, mw.ts, mw.wert, mw.qualitaet, mw.herkunft
          FROM measurement.messwert mw
          JOIN kanaele k ON k.kanal_key = mw.messkanal_key
         CROSS JOIN grenzen g
         WHERE mw.ts < g.von_ts
         ORDER BY mw.messkanal_key, mw.ts DESC
      ) vor
  ),
  mit_tag AS (
    SELECT f.*, (date_trunc('day', f.ts AT TIME ZONE $4::text))::date AS lokaler_tag
      FROM fenster f
  ),
  sortiert AS (
    SELECT mt.*, lag(mt.wert) OVER (PARTITION BY mt.messkanal_key ORDER BY mt.ts) AS vorwert
      FROM mit_tag mt
  ),
  deltas AS (
    SELECT s.messkanal_key, s.lokaler_tag, s.qualitaet, s.herkunft,
           CASE
             WHEN k.art = 'intervall_verbrauch' THEN s.wert
             WHEN s.vorwert IS NULL THEN NULL
             WHEN (s.wert - s.vorwert) < 0 THEN NULL
             ELSE s.wert - s.vorwert
           END AS verbrauch
      FROM sortiert s
      JOIN kanaele k ON k.kanal_key = s.messkanal_key
     CROSS JOIN grenzen g
     WHERE s.ts >= g.von_ts AND s.ts < g.bis_ts
  ),
  aggregat AS (
    SELECT messkanal_key,
           lokaler_tag,
           sum(verbrauch) AS verbrauch_kwh,
           min(measurement.rang(qualitaet, herkunft)) AS qualitaet_min,
           count(*)::int AS anzahl_messwerte
      FROM deltas
     GROUP BY messkanal_key, lokaler_tag
    HAVING sum(verbrauch) IS NOT NULL
  )`;

export interface VerdichtungsFenster {
  readonly messkanalKeys: readonly number[];
  /** Erster lokaler Kalendertag, ISO `YYYY-MM-DD` (einschliesslich). */
  readonly vonTag: string;
  /** Erster NICHT mehr enthaltener lokaler Kalendertag, ISO `YYYY-MM-DD`. */
  readonly bisTag: string;
  readonly zeitzone: string;
}

@Injectable()
export class MesswertVerdichtungRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * Messkanäle mit Rohwerten im Fenster, aufsteigend ab `nachKanalKey`
   * (Keyset-Pagination — kein `OFFSET`, das bei jedem Durchgang teurer
   * würde).
   *
   * Es werden nur Kanäle geliefert, die im Fenster überhaupt Rohwerte haben.
   * Ein Kanal ohne Rohwerte würde die teure Aggregat-Abfrage auslösen, um
   * anschliessend nichts zu schreiben.
   */
  async findKanaeleMitRohwerten(options: {
    readonly vonTag: string;
    readonly bisTag: string;
    readonly zeitzone: string;
    readonly nachKanalKey: number;
    readonly limit: number;
  }): Promise<number[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT DISTINCT mw.messkanal_key
         FROM measurement.messwert mw
        WHERE mw.ts >= (($1::date)::timestamp AT TIME ZONE $3::text)
          AND mw.ts <  (($2::date)::timestamp AT TIME ZONE $3::text)
          AND mw.messkanal_key > $4
        ORDER BY mw.messkanal_key
        LIMIT $5`,
      [options.vonTag, options.bisTag, options.zeitzone, options.nachKanalKey, options.limit],
    );

    return mapManyRows(bindRows<{ readonly messkanal_key: number }>(rawRows), (row) => row.messkanal_key);
  }

  /**
   * Probelauf: zählt die Tageszeilen, die entstünden — schreibt nichts.
   *
   * Bewusst dieselbe CTE wie der Schreibpfad. Ein Probelauf, der eine andere
   * Abfrage benutzt als die Ausführung, sagt über die Ausführung nichts aus.
   */
  async zaehleTageszeilen(fenster: VerdichtungsFenster): Promise<number> {
    if (fenster.messkanalKeys.length === 0) {
      return 0;
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `${AGGREGAT_CTE}
       SELECT count(*)::int AS anzahl FROM aggregat`,
      [fenster.messkanalKeys, fenster.vonTag, fenster.bisTag, fenster.zeitzone],
    );

    return mapOneRow(bindRows<{ readonly anzahl: number }>(rawRows), (row) => row.anzahl) ?? 0;
  }

  /**
   * Schreibt die Tageszeilen des Fensters.
   *
   * **Die Schutzbedingung im `ON CONFLICT` ist der wichtigste Teil dieser
   * Methode.** Eine bestehende Zeile wird nur ersetzt, wenn die neue auf
   * MINDESTENS so vielen Rohwerten beruht. Ohne diese Bedingung würde ein
   * Lauf, der nach einem teilweisen `drop_chunks` über dasselbe Fenster
   * geht, gute Tageswerte durch solche aus Rest-Rohdaten ersetzen — und der
   * Nachweis wäre still falsch. Genau dieser Fall ist nicht theoretisch: Er
   * tritt ein, sobald Stufe A und ein Nachverdichtungslauf sich überlappen.
   *
   * Ein Backfill, der Rohwerte NACHTRÄGT, erhöht `anzahl_messwerte` und darf
   * deshalb korrigieren — das ist die erwünschte Richtung.
   */
  async schreibeTageszeilen(fenster: VerdichtungsFenster): Promise<number> {
    if (fenster.messkanalKeys.length === 0) {
      return 0;
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `${AGGREGAT_CTE}
       INSERT INTO measurement.messwert_tag
             (messkanal_key, tag, zeitzone, verbrauch_kwh, qualitaet_min, anzahl_messwerte)
       SELECT messkanal_key, lokaler_tag, $4::text, verbrauch_kwh, qualitaet_min, anzahl_messwerte
         FROM aggregat
       ON CONFLICT (messkanal_key, tag) DO UPDATE
          SET zeitzone         = EXCLUDED.zeitzone,
              verbrauch_kwh    = EXCLUDED.verbrauch_kwh,
              qualitaet_min    = EXCLUDED.qualitaet_min,
              anzahl_messwerte = EXCLUDED.anzahl_messwerte,
              verdichtet_at    = now()
        WHERE EXCLUDED.anzahl_messwerte >= measurement.messwert_tag.anzahl_messwerte
       RETURNING messkanal_key`,
      [fenster.messkanalKeys, fenster.vonTag, fenster.bisTag, fenster.zeitzone],
    );

    return bindRows<{ readonly messkanal_key: number }>(rawRows).length;
  }

  /**
   * Zeilen im Bestand, die unter einer ANDEREN Zeitzone gebildet wurden.
   *
   * Der Lauf verweigert die Arbeit, wenn das vorkommt: Ein `tag`, der unter
   * `Europe/Berlin` geschnitten wurde, und einer unter `UTC` bezeichnen
   * verschiedene Zeiträume und dürfen nicht in derselben Spalte
   * nebeneinanderstehen. Die Auflösung ist eine bewusste Neuverdichtung des
   * betroffenen Zeitraums, keine stillschweigende Fortschreibung.
   */
  async zaehleAbweichendeZeitzone(zeitzone: string): Promise<number> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT count(*)::int AS anzahl FROM measurement.messwert_tag WHERE zeitzone <> $1`,
      [zeitzone],
    );

    return mapOneRow(bindRows<{ readonly anzahl: number }>(rawRows), (row) => row.anzahl) ?? 0;
  }
}
