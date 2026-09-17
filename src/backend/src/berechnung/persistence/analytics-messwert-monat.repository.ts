import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import { toIsoDateString } from './pg-date.util';

/**
 * ADR-0006 — Ist-Verbrauch je (Messkanal, lokaler Kalendertag), gespiegelt
 * vom Differenzbildungs-Kern in
 * `messwerte/persistence/measurement-messwert.repository.ts`
 * (`findVerbrauchAggregiert`, Arbeitsauftrag: "wiederverwenden/spiegeln").
 * DREI wesentliche Abweichungen ggü. dem Vorbild (dort UTC-`time_bucket`,
 * hier Tages-/Monatslogik):
 *
 *   1. **Lokale Kalendertage statt UTC-Buckets** (ADR-0006 B5, D4, wörtlich):
 *      "Gradtagzahlen sind auf lokale Kalendertage definiert. Die
 *      Tagesbildung erfolgt über `date_trunc('day', ts AT TIME ZONE
 *      'Europe/Berlin')` — bewusst NICHT über `time_bucket(..., timezone
 *      => ...)`, um jede Timescale-Lizenzfrage zu vermeiden." Diese Query
 *      übernimmt das 1:1, `zeitzone` ist ein eingefrorener Lauf-Parameter.
 *   2. **Zähler-/Messkanal-Menge kommt vom Aufrufer** (`zaehlerIds`,
 *      analog zum Vorbild) — hergeleitet über die V0028-Systemgrenze
 *      (`findAktiveZaehlerIdsFuerSysteme()`), mit
 *      `findAktiveZaehlerIds()` als Fallback für noch ungepflegte
 *      Zuordnungen; s. die Kommentare an beiden Methoden.
 *   3. **Zeilenform ist PRO (Messkanal, Tag)**, NICHT über Kanäle
 *      aggregiert — exakter Zuschnitt von
 *      `analytics.eingang_messwert_tag(snapshot_id, messkanal_key, tag,
 *      wert_kwh, qualitaet_min, anzahl_messwerte)` (V0019). Die
 *      Kanal-übergreifende Tages-/Monatsverdichtung (Ist-kWh-Summe,
 *      B12.4-Abdeckung) ist bewusst App-seitig (`BerechnungslaufService`),
 *      NICHT hier — dieses Repository liefert nur die Rohbausteine, die
 *      1:1 die Snapshot-Detailzeilen werden.
 *
 * Tage OHNE gültige Differenz (Zählerwechsel/-überlauf, kein Vorwert) werden
 * NIE als 0-kWh-Zeile ausgegeben (`HAVING sum(verbrauch) IS NOT NULL`,
 * identisches Prinzip zum Vorbild "Lücken nie als 0") — sie fehlen einfach
 * für diesen Kanal/Tag, der Aufrufer wertet das als "kein Wert" (B12.4:
 * fließt in `tage_fehlend`/`tage_ersatz`/`tage_geschaetzt` je nach WORST-Case
 * über alle Kanäle des Tages ein).
 */
export interface TagesaggregatZeile {
  readonly messkanalKey: number;
  /** Lokaler Kalendertag, ISO `YYYY-MM-DD`. */
  readonly tag: string;
  readonly wertKwh: number;
  /** `measurement.rang(qualitaet, herkunft)`, MINIMUM über alle Rohwerte dieses Kanal-Tages (B12.4: "niedrigster Rang des Tages"). */
  readonly qualitaetMin: number;
  readonly anzahlMesswerte: number;
}

interface TagesaggregatRow {
  readonly messkanal_key: number;
  // `::date`-Cast-Ausdruck — s. `pg-date.util.ts`-Kopf-Kommentar (pg liefert
  // HIER ein `Date`-Objekt, lokale Mitternacht, KEIN String). KRITISCH hier:
  // `tag` fließt direkt in Datums-STRING-Vergleiche im Service ein.
  readonly lokaler_tag: unknown;
  readonly wert_kwh: string;
  readonly qualitaet_min: number;
  readonly anzahl_messwerte: string;
}

/**
 * **Untermessungen bleiben ausgelassen (V0058).** Ein Kanal mit
 * `ist_untermessung` misst eine TEILMENGE dessen, was die Hauptmessung
 * desselben Systems ohnehin erfasst. Summierte man beide, staende derselbe
 * Strom zweimal im Ist-Verbrauch — und die Einsparung, die daraus folgt, waere
 * gegenueber der Bewilligungsbehoerde falsch. Sichtbar wurde das an einem
 * Bestand mit einer Hauptmessung und zwei Untermessungen: Er wies trotz
 * 12 Prozent weniger Verbrauch eine Einsparung von MINUS 18 154 kWh aus.
 *
 * Die Angabe steht seit V0058 am Messkanal und nicht mehr an der
 * TB-05-Zuordnung: Ob ein Zaehler eine Teilmenge misst, ist eine Eigenschaft
 * der Messstelle und steht beim Einbau fest. Haenge die Einsparzahl an der
 * Zuordnung, haenge sie daran, ob jemand die Geraeteerkennung gepflegt hat.
 */
/**
 * Einheiten, deren Werte OHNE Umrechnung in den Ist-Verbrauch (kWh) eingehen.
 *
 * Bewusst nur `kWh` — symmetrisch zur Baseline-Seite, die eine abweichende
 * `baseline_einheit` fail-closed ablehnt statt umzurechnen
 * (`BASELINE_EINHEIT_UNGUELTIG`, "wird in v1 NICHT automatisch umgerechnet").
 * Eine Umrechnungstabelle waere eine eigene Fachfunktion: `m³` Gas braucht
 * Brennwert und Zustandszahl, beides ist im Schema nicht erfasst, und
 * `MWh`/`Wh` blieben stille Faktor-1000-Fallen, solange niemand sie prueft.
 *
 * `messgroesse` bleibt bewusst UNGEPRUEFT: das Feld ist Freitext (V0002, kein
 * CHECK, kein Katalog), waehrend die EINHEIT die physikalische Aussage traegt.
 * Ein Kanal in kWh ist summierbar, wie auch immer seine Messgroesse heisst.
 */
export const VERWERTBARE_MESSKANAL_EINHEITEN: readonly string[] = ['kWh'];

@Injectable()
export class AnalyticsMesswertMonatRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * **FALLBACK, nicht der Regelweg** — ALLE AKTIVEN Zähler des Endkunden
   * (über `energy.system.endkunde_id`) MIT PASSENDEM `energietraeger`.
   *
   * Diese Heuristik stammt aus der Zeit vor V0028, als das Schema keine
   * Bindung `mvet -> System` kannte. Sie ist gröber als eine echte
   * Systemgrenze: Ein Endkunde mit ZWEI unabhängigen Gas-Messkonzepten
   * bekam in BEIDEN Läufen die Summe BEIDER Systeme — jedes Messkonzept
   * wies den Verbrauch des anderen mit aus, und die daraus abgeleitete
   * Einsparung ging so in den BAFA-Nachweis.
   *
   * Seit V0028 gibt es die Zuordnung, und der Regelweg ist
   * `findAktiveZaehlerIdsFuerSysteme()`. Diese Methode greift nur noch,
   * solange für eine `mvet` KEINE Zuordnung gepflegt ist — der von V0028
   * ausdrücklich vorgesehene Übergangszustand ("Tabelle startet LEER"), der
   * einen Bestandslauf nicht scheitern lassen darf. Der Aufrufer MUSS
   * kenntlich machen, dass er hier gelandet ist
   * (`kontext.systemgrenze_quelle = 'endkunde_fallback'` am Lauf-Audit-Event):
   * Eine stillschweigende Ausweitung auf den ganzen Kunden ist genau der
   * Fehler, der oben beschrieben ist.
   */
  async findAktiveZaehlerIds(endkundeId: string, energietraeger: string): Promise<string[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT z.id
         FROM energy.zaehler z
         JOIN energy.system s ON s.id = z.system_id
        WHERE s.endkunde_id = $1 AND z.energietraeger = $2 AND z.status = 'aktiv'`,
      [endkundeId, energietraeger],
    );

    return mapManyRows(bindRows<{ readonly id: string }>(rawRows), (row) => row.id);
  }

  /**
   * **Regelweg (V0028).** Aktive Zähler der Systeme, die DIESEM Messkonzept
   * zugeordnet sind — die Systemgrenze, wie die Zuordnungstabelle sie
   * festlegt.
   *
   * Der `energietraeger`-Filter bleibt: Ein System kann Zähler mehrerer
   * Energieträger tragen (Gas UND Strom), die `mvet` gilt aber genau für
   * einen. Ohne den Filter zöge ein Gas-Messkonzept die Stromzähler
   * desselben Systems mit heran.
   *
   * `status = 'aktiv'` wie im Fallback — stillgelegte Zähler liefern keine
   * Werte mehr, würden aber die erwartete Kanalzahl der
   * B12.4-Vollständigkeitsprüfung erhöhen und damit jeden Tag als
   * unvollständig ausweisen.
   */
  async findAktiveZaehlerIdsFuerSysteme(systemIds: readonly string[], energietraeger: string): Promise<string[]> {
    if (systemIds.length === 0) {
      return [];
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT z.id
         FROM energy.zaehler z
        WHERE z.system_id = ANY($1::uuid[]) AND z.energietraeger = $2 AND z.status = 'aktiv'`,
      [systemIds, energietraeger],
    );

    return mapManyRows(bindRows<{ readonly id: string }>(rawRows), (row) => row.id);
  }

  /**
   * Kanal-Bestand der übergebenen Zähler, aufgeteilt nach Verwertbarkeit.
   *
   * `verwertbar` ist die "erwartete Kanalzahl je Tag"
   * (B12.4-Vollständigkeitsprüfung) und zählt GENAU die Kanäle, die die
   * Aggregation auch summiert — gleiche Filter, sonst fiele die Abdeckung
   * grundlos auf einen Bruchteil:
   *   - OHNE Untermessungen (V0058), sonst zählte derselbe Verbrauch doppelt,
   *   - NUR verwertbare Einheiten (s. `VERWERTBARE_MESSKANAL_EINHEITEN`).
   *
   * `fremdeEinheiten` sind die Einheiten der übrigen aktiven Hauptmessungen.
   * Sie werden NICHT stillschweigend übergangen: Der Aufrufer bricht den Lauf
   * fail-closed ab. Beide stillen Alternativen wären fachlich falsch — sie
   * mitzusummieren ergäbe eine kWh-Zahl aus Fremdgrößen (m³, kvarh), sie
   * wegzulassen ergäbe einen zu niedrigen Ist-Verbrauch und damit eine zu
   * hohe ausgewiesene Einsparung.
   */
  async ermittleAktiveMesskanaele(
    zaehlerIds: readonly string[],
  ): Promise<{ readonly verwertbar: number; readonly fremdeEinheiten: readonly string[] }> {
    if (zaehlerIds.length === 0) {
      return { verwertbar: 0, fremdeEinheiten: [] };
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT count(*) FILTER (WHERE einheit = ANY($2::text[]))::int AS verwertbar,
              coalesce(
                array_agg(DISTINCT einheit) FILTER (WHERE NOT (einheit = ANY($2::text[]))),
                ARRAY[]::text[]
              ) AS fremde_einheiten
         FROM energy.messkanal
        WHERE zaehler_id = ANY($1::uuid[])
          AND status = 'aktiv'
          AND NOT ist_untermessung`,
      [zaehlerIds, VERWERTBARE_MESSKANAL_EINHEITEN],
    );

    const row = mapOneRow(
      bindRows<{ readonly verwertbar: number; readonly fremde_einheiten: readonly string[] }>(rawRows),
      (r) => ({ verwertbar: r.verwertbar, fremdeEinheiten: r.fremde_einheiten }),
    );
    return row ?? { verwertbar: 0, fremdeEinheiten: [] };
  }

  /**
   * Erster und letzter LOKALER Kalendertag, für den diese Zähler überhaupt
   * Messwerte tragen — die Datengrundlage in einer Zeile.
   *
   * Nur für den Parameter-VORSCHLAG (`ParametervorschlagService`), nie für
   * eine Rechnung: Die Spanne sagt, WORÜBER sich rechnen ließe, und
   * verhindert damit die haeufigste Fehlbedienung — einen Zeitraum
   * anzufordern, in dem gar keine Daten liegen. Der Lauf antwortet darauf
   * heute mit lauter leeren Monaten statt mit einer Erklaerung.
   *
   * Bewusst OHNE Differenzbildung und ohne Untermessungs-Filter: Gefragt ist
   * die AUSDEHNUNG der Reihe, nicht ihr Inhalt. Eine Zeile, die als Vorwert
   * dient, ist fuer die Frage „ab wann gibt es hier ueberhaupt etwas" so
   * gueltig wie jede andere.
   */
  async findeDatenspanne(
    zaehlerIds: readonly string[],
    zeitzone: string,
  ): Promise<{ readonly von: string; readonly bis: string } | undefined> {
    if (zaehlerIds.length === 0) {
      return undefined;
    }
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT (date_trunc('day', min(mw.ts) AT TIME ZONE $2::text))::date AS von,
              (date_trunc('day', max(mw.ts) AT TIME ZONE $2::text))::date AS bis
         FROM measurement.messwert mw
         JOIN energy.messkanal mk ON mk.kanal_key = mw.messkanal_key
        WHERE mk.zaehler_id = ANY($1::uuid[])
          AND mk.status = 'aktiv'`,
      [[...zaehlerIds], zeitzone],
    );
    const zeile = (rawRows as { von: unknown; bis: unknown }[])[0];
    if (zeile === undefined || zeile.von === null || zeile.bis === null) {
      return undefined;
    }
    return { von: toIsoDateString(zeile.von), bis: toIsoDateString(zeile.bis) };
  }

  /**
   * Tages-/Kanal-Rohbausteine für `[von, bis)` (halboffen, wie im Vorbild).
   * Vorlauf-Zeile je Kanal (letzter Wert VOR `von`) exakt wie im Vorbild,
   * damit die Differenz des ersten Rohwerts im Fenster nicht fälschlich
   * `NULL` wird.
   */
  async berechneTagesaggregation(options: {
    readonly zaehlerIds: readonly string[];
    readonly von: string;
    readonly bis: string;
    readonly zeitzone: string;
  }): Promise<TagesaggregatZeile[]> {
    if (options.zaehlerIds.length === 0) {
      return [];
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `WITH kanaele AS (
         SELECT kanal_key, art
           FROM energy.messkanal
          WHERE zaehler_id = ANY($1::uuid[])
            AND status = 'aktiv'
            AND NOT ist_untermessung
            AND einheit = ANY($5::text[])
       ),
       fenster AS (
         SELECT mw.messkanal_key, mw.ts, mw.wert, mw.qualitaet, mw.herkunft
           FROM measurement.messwert mw
           JOIN kanaele k ON k.kanal_key = mw.messkanal_key
          WHERE mw.ts >= $2::timestamptz AND mw.ts < $3::timestamptz
         UNION ALL
         SELECT vor.messkanal_key, vor.ts, vor.wert, vor.qualitaet, vor.herkunft
           FROM (
             SELECT DISTINCT ON (mw.messkanal_key) mw.messkanal_key, mw.ts, mw.wert, mw.qualitaet, mw.herkunft
               FROM measurement.messwert mw
               JOIN kanaele k ON k.kanal_key = mw.messkanal_key
              WHERE mw.ts < $2::timestamptz
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
          WHERE s.ts >= $2::timestamptz AND s.ts < $3::timestamptz
       )
       SELECT messkanal_key, lokaler_tag,
              sum(verbrauch) AS wert_kwh,
              min(measurement.rang(qualitaet, herkunft)) AS qualitaet_min,
              count(*) AS anzahl_messwerte
         FROM deltas
        GROUP BY messkanal_key, lokaler_tag
       HAVING sum(verbrauch) IS NOT NULL
        ORDER BY lokaler_tag ASC, messkanal_key ASC`,
      [options.zaehlerIds, options.von, options.bis, options.zeitzone, VERWERTBARE_MESSKANAL_EINHEITEN],
    );

    return mapManyRows(bindRows<TagesaggregatRow>(rawRows), (row) => ({
      messkanalKey: row.messkanal_key,
      tag: toIsoDateString(row.lokaler_tag),
      wertKwh: Number.parseFloat(row.wert_kwh),
      qualitaetMin: row.qualitaet_min,
      anzahlMesswerte: Number.parseInt(row.anzahl_messwerte, 10),
    }));
  }
}
