import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import type { Aufloesung } from '../verbrauch-aggregat.types';
import type { MesswertHerkunft, MesswertQualitaet } from '../messkanal-zeitreihe.types';

/**
 * Verbrauchs-/Messwert-Lesepfad (letztes fehlendes Ausliefer-Stück,
 * ADR-0005/-0010) — EINZIGES Repository, das `measurement.messwert` aus dem
 * "App"-Schreib-/Lesepfad (`TransactionHost`, dieselbe `DataSource` wie
 * `stammdaten/persistence/energy/**`) anfasst; der Ingest-Worker (eigener,
 * isolierter `INGEST_PG_POOL`) bleibt komplett unberührt.
 *
 * OFFENER PUNKT (bitte melden, nicht in dieser Migration/diesem Paket
 * behoben): die "allgemeine RBAC-DB-Rollen-Verdrahtung" für den App-seitigen
 * Lesepfad auf `energy.*`/`measurement.*` ist laut
 * `migrations/V0012__measurement_taegliche_abdeckung.sql` (Kommentar
 * "Konsumenten-Grants ... in diesem Repo bislang in KEINER Migration
 * umgesetzt") repoweit NOCH NICHT umgesetzt — Dev/Test läuft über den
 * Superuser-Bootstrap-User (`DatabaseModule`), Prod bräuchte ein explizites
 * `GRANT SELECT ON measurement.messwert TO edms_app` (+ `energy.messkanal`/
 * `energy.zaehler`/`energy.standort`/`energy.zaehler_standort`, dort bereits
 * implizit über denselben Bootstrap-Pfad gedeckt). Dieses Repository fügt
 * dem bekannten, bereits dokumentierten Gap KEINE neue Dimension hinzu — es
 * ist der ERSTE App-seitige Konsument von `measurement.messwert`, nicht der
 * erste App-seitige Konsument von `energy.*`.
 */

const AUFLOESUNG_INTERVALL: Readonly<Record<Aufloesung, string>> = {
  stunde: '1 hour',
  tag: '1 day',
  monat: '1 month',
};

/** LESERICHTUNG (DB-Code -> Label), V0002/V0013/V0014-Kanon — s. Datei-Kopf `messkanal-zeitreihe.types.ts`. */
const QUALITAET_LABELS: readonly MesswertQualitaet[] = ['gemessen', 'geschaetzt', 'korrigiert', 'ersatzwert'];
const HERKUNFT_LABELS: readonly MesswertHerkunft[] = ['ingest_live', 'backfill', 'manuell', 'import_altsystem'];

function toQualitaetLabel(code: number): MesswertQualitaet {
  return QUALITAET_LABELS[code] ?? 'gemessen';
}

function toHerkunftLabel(code: number): MesswertHerkunft {
  return HERKUNFT_LABELS[code] ?? 'ingest_live';
}

export interface VerbrauchAggregatOptions {
  readonly zaehlerIds: readonly string[];
  /** UTC-ISO-8601, Intervall-Untergrenze (inklusive). */
  readonly von: string;
  /** UTC-ISO-8601, Intervall-Obergrenze (EXKLUSIVE). */
  readonly bis: string;
  readonly aufloesung: Aufloesung;
}

/** EINE Zeile der Aggregation — `wert===null` heißt "erkannte Lücke", NIEMALS 0. */
export interface VerbrauchAggregatZeile {
  readonly zeitpunkt: string;
  readonly messgroesse: string;
  readonly einheit: string;
  readonly wert: number | null;
}

interface VerbrauchAggregatRow {
  readonly zeitpunkt: string;
  readonly messgroesse: string;
  readonly einheit: string;
  readonly wert: string | null;
}

function mapVerbrauchAggregatRow(row: VerbrauchAggregatRow): VerbrauchAggregatZeile {
  return {
    zeitpunkt: row.zeitpunkt,
    messgroesse: row.messgroesse,
    einheit: row.einheit,
    wert: row.wert === null ? null : Number(row.wert),
  };
}

interface RohwertRow {
  readonly ts: string;
  readonly wert: string;
  readonly qualitaet: number;
  readonly herkunft: number;
}

@Injectable()
export class MeasurementMesswertRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * Kern-Aggregation (Route A, `read:verbrauch_aggregat`).
   *
   * Fachlicher Kern (s. Klassen-/Modul-Dok des Arbeitsauftrags), ALLES im
   * SQL selbst gelöst (kein nachträgliches App-seitiges Nachbessern):
   *
   *   1. **Differenzbildung nur bei `art='kumulativ_zaehlerstand'`** — über
   *      `lag(wert) OVER (PARTITION BY messkanal_key ORDER BY ts)`.
   *      `intervall_verbrauch` wird DIREKT summiert (`CASE`-Zweig).
   *   2. **Zählerwechsel/-überlauf** (negative Differenz) wird über die
   *      `CASE`-Bedingung `(wert - vorwert) < 0 THEN NULL` NIE als negativer
   *      Verbrauch gezählt — `sum(...)` ignoriert `NULL`-Werte (SQL-
   *      Standardverhalten), ein einzelner ungültiger Sprung reißt also
   *      NICHT die übrigen, gültigen Werte desselben Buckets/derselben
   *      Gruppe mit herunter.
   *   3. **Lücken werden NIE als 0 ausgegeben**: das Ergebnis enthält für
   *      JEDEN erwarteten Bucket (`generate_series`, `matrix`-CTE) EINE
   *      Zeile, unabhängig davon, ob überhaupt Rohwerte vorlagen. Existiert
   *      keine Zeile mit einem verwertbaren `verbrauch` (weder Rohwert noch
   *      gültige Differenz), bleibt `wert IS NULL` — der Aufrufer
   *      (`VerbrauchAggregatService`) filtert NULL-Zeilen aus der
   *      Zeitreihe heraus und zählt sie separat als `erkannteLuecken`.
   *   4. **Gemischte Einheiten werden nie summiert**: Gruppierung läuft
   *      über `(messgroesse, einheit)` — zwei Kanäle mit unterschiedlicher
   *      Einheit (oder unterschiedlicher Messgröße bei zufällig gleicher
   *      Einheit) landen NIE in derselben Summe.
   *   5. **Aggregation über mehrere Zähler/Vererbung über Ebenen/
   *      Zeitscheiben-Korrektheit**: strukturell bereits durch die
   *      `zaehlerIds` sichergestellt — diese Methode bekommt AUSSCHLIESSLICH
   *      die vom Aufrufer (`EnergyStandortRepository.findZaehlerUnterKnoten()`,
   *      Kern-Query D6) zum Stichtag ermittelten Zähler-IDs, kennt Knoten/
   *      Pfad/Stichtag selbst gar nicht.
   *
   * Vorlauf-Zeile je Kanal (`fenster`-CTE, zweiter `UNION ALL`-Zweig): OHNE
   * sie wäre die Differenz des ERSTEN Rohwerts im Fenster IMMER `NULL`
   * (fehlender Vorwert), selbst wenn ein Vorwert unmittelbar VOR `von`
   * existiert — die Kern-Query holt daher explizit GENAU EINEN
   * Vorlaufwert je Kanal (`DISTINCT ON`, letzter Wert VOR `von`) und lässt
   * ihn nur als LAG-Quelle wirken (die abschließende `WHERE ts >= von`-
   * Bedingung in der `deltas`-CTE schließt die Vorlaufzeile selbst wieder
   * aus der Ausgabe aus).
   */
  async findVerbrauchAggregiert(options: VerbrauchAggregatOptions): Promise<VerbrauchAggregatZeile[]> {
    if (options.zaehlerIds.length === 0) {
      return [];
    }

    const intervall = AUFLOESUNG_INTERVALL[options.aufloesung];
    const rawRows: unknown = await this.txHost.tx.query(
      `WITH kanaele AS (
         SELECT kanal_key, messgroesse, einheit, art
           FROM energy.messkanal
          WHERE zaehler_id = ANY($1::uuid[])
            AND status = 'aktiv'
            AND NOT ist_untermessung
       ),
       gruppen AS (
         SELECT DISTINCT messgroesse, einheit FROM kanaele
       ),
       fenster AS (
         SELECT mw.messkanal_key, mw.ts, mw.wert
           FROM measurement.messwert mw
           JOIN kanaele k ON k.kanal_key = mw.messkanal_key
          WHERE mw.ts >= $2::timestamptz AND mw.ts < $3::timestamptz
         UNION ALL
         SELECT vor.messkanal_key, vor.ts, vor.wert
           FROM (
             SELECT DISTINCT ON (mw.messkanal_key) mw.messkanal_key, mw.ts, mw.wert
               FROM measurement.messwert mw
               JOIN kanaele k ON k.kanal_key = mw.messkanal_key
              WHERE mw.ts < $2::timestamptz
              ORDER BY mw.messkanal_key, mw.ts DESC
           ) vor
       ),
       sortiert AS (
         SELECT f.messkanal_key, f.ts, f.wert,
                lag(f.wert) OVER (PARTITION BY f.messkanal_key ORDER BY f.ts) AS vorwert
           FROM fenster f
       ),
       deltas AS (
         SELECT s.messkanal_key, k.messgroesse, k.einheit, s.ts,
                CASE
                  WHEN k.art = 'intervall_verbrauch' THEN s.wert
                  WHEN s.vorwert IS NULL THEN NULL
                  WHEN (s.wert - s.vorwert) < 0 THEN NULL
                  ELSE s.wert - s.vorwert
                END AS verbrauch
           FROM sortiert s
           JOIN kanaele k ON k.kanal_key = s.messkanal_key
          WHERE s.ts >= $2::timestamptz AND s.ts < $3::timestamptz
       ),
       aggregiert AS (
         SELECT time_bucket($4::interval, ts) AS zeitpunkt, messgroesse, einheit,
                sum(verbrauch) AS wert
           FROM deltas
          GROUP BY 1, 2, 3
       ),
       buckets AS (
         SELECT generate_series(
                  time_bucket($4::interval, $2::timestamptz),
                  time_bucket($4::interval, $3::timestamptz - interval '1 microsecond'),
                  $4::interval
                ) AS zeitpunkt
       ),
       matrix AS (
         SELECT b.zeitpunkt, g.messgroesse, g.einheit
           FROM buckets b CROSS JOIN gruppen g
       )
       SELECT m.zeitpunkt, m.messgroesse, m.einheit, a.wert
         FROM matrix m
         LEFT JOIN aggregiert a
           ON a.zeitpunkt = m.zeitpunkt AND a.messgroesse = m.messgroesse AND a.einheit = m.einheit
        ORDER BY m.zeitpunkt ASC, m.messgroesse ASC, m.einheit ASC`,
      [options.zaehlerIds, options.von, options.bis, intervall],
    );

    return mapManyRows(bindRows<VerbrauchAggregatRow>(rawRows), mapVerbrauchAggregatRow);
  }

  /**
   * Metadaten-Hilfsquery — aktiver Kanalbestand der übergebenen Zähler,
   * getrennt nach Haupt- und Untermessung.
   *
   * `hauptmessungen` zählt GENAU die Kanäle, die `findVerbrauchAggregiert()`
   * auch summiert (`metadaten.einbezogeneKanaele`). Untermessungen (V0058)
   * messen eine TEILMENGE dessen, was eine Hauptmessung desselben Systems
   * bereits erfasst — summierte man sie mit, stünde derselbe Verbrauch
   * zweimal in der angezeigten Kurve, und der Bediener vergliche eine zu
   * hohe Anzeige mit dem korrekt gerechneten Ist-Verbrauch eines Laufs.
   *
   * Sie werden deshalb ausgelassen, aber GEZÄHLT: `untermessungen` geht als
   * `metadaten.ausgelasseneUntermessungen` an die Oberfläche, damit die
   * Differenz zur Kanalzahl der Stammdaten erklärbar bleibt statt zu
   * verwirren.
   */
  async ermittleAktiveMesskanaele(
    zaehlerIds: readonly string[],
  ): Promise<{ readonly hauptmessungen: number; readonly untermessungen: number }> {
    if (zaehlerIds.length === 0) {
      return { hauptmessungen: 0, untermessungen: 0 };
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT count(*) FILTER (WHERE NOT ist_untermessung)::int AS hauptmessungen,
              count(*) FILTER (WHERE ist_untermessung)::int AS untermessungen
         FROM energy.messkanal
        WHERE zaehler_id = ANY($1::uuid[]) AND status = 'aktiv'`,
      [zaehlerIds],
    );

    const row = mapOneRow(
      bindRows<{ readonly hauptmessungen: number; readonly untermessungen: number }>(rawRows),
      (r) => ({ hauptmessungen: r.hauptmessungen, untermessungen: r.untermessungen }),
    );
    return row ?? { hauptmessungen: 0, untermessungen: 0 };
  }

  /**
   * Roh-Zeitreihe EINES Messkanals (Route B, `read:verbrauch_detail`,
   * break-glass-gehärtet) — KEINE Differenzbildung/Aggregation, `qualitaet`/
   * `herkunft` bleiben sichtbar (Detailansicht). Auflösung `messkanalId`
   * (UUID) -> `kanal_key` (internes Integer-Surrogat) läuft AUSSCHLIESSLICH
   * innerhalb dieses JOINs — `kanal_key` selbst verlässt diese Methode nie
   * (§12-Konvention, analog `EnergyStammdatenLookupRepository`/
   * `MesswertSchreibpfadRepository` im Ingest-Worker).
   */
  async findRohwerte(messkanalId: string, von: string, bis: string): Promise<
    { readonly ts: string; readonly wert: number; readonly qualitaet: MesswertQualitaet; readonly herkunft: MesswertHerkunft }[]
  > {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT mw.ts, mw.wert, mw.qualitaet, mw.herkunft
         FROM measurement.messwert mw
         JOIN energy.messkanal mk ON mk.kanal_key = mw.messkanal_key
        WHERE mk.id = $1::uuid
          AND mw.ts >= $2::timestamptz AND mw.ts < $3::timestamptz
        ORDER BY mw.ts ASC`,
      [messkanalId, von, bis],
    );

    return mapManyRows(bindRows<RohwertRow>(rawRows), (row) => ({
      ts: row.ts,
      wert: Number(row.wert),
      qualitaet: toQualitaetLabel(row.qualitaet),
      herkunft: toHerkunftLabel(row.herkunft),
    }));
  }
}
