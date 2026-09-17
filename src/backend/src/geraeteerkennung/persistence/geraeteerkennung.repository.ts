import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import { toIsoDateString, toIsoDateStringOrNull } from '../../stammdaten/persistence/pg-date.util';
import type { Erkennungsmethode, GeraetegruppeItem, ZuordnungItem } from '../geraeteerkennung.types';

export interface ZuordnungAnlegenInput {
  readonly geraetegruppeId: string;
  readonly messkanalId: string;
  readonly methode: Erkennungsmethode;
  readonly genauigkeitPct: number | undefined;
  readonly anteilProzent: number;
  readonly gueltigVon: string;
}

export interface VerbrauchsSummen {
  readonly gesamtKwh: number;
  readonly zugeordnetKwh: number;
  readonly tageMitWerten: number;
}

/**
 * Die Auflösung „welche Zuordnung galt an DIESEM Tag" — als LATERAL, weil sie
 * je Messwert-Tag getroffen werden muss.
 *
 * Sie liefert höchstens eine Zeile: Der Exclusion-Constraint aus V0056 lässt
 * je Messkanal und Zeitpunkt nur EINE Zuordnung zu. Ohne ihn bräuchte es hier
 * ein `LIMIT 1` mit einer willkürlichen Reihenfolge — und die Quote hinge an
 * einer Sortierung.
 */
const ZUORDNUNG_AM_TAG = `
  LEFT JOIN LATERAL (
    SELECT k.geraetegruppe_id, k.anteil_prozent, k.methode, k.genauigkeit_pct, g.bezeichnung
      FROM energy.geraetegruppe_kanal k
      JOIN energy.geraetegruppe g ON g.id = k.geraetegruppe_id
     WHERE k.messkanal_id = mk.id
       AND k.gueltig_von <= t.tag
       AND (k.gueltig_bis IS NULL OR k.gueltig_bis > t.tag)
  ) zu ON true`;

/**
 * Der gemeinsame Rumpf beider Verbrauchs-Abfragen.
 *
 * **Tagesgenau, nicht zeitraumgenau.** Eine Zuordnung, die Mitte des Jahres
 * beginnt, darf nur die Tage ab ihrem Beginn in den Zähler bringen. Würde
 * stattdessen der ganze Zeitraum gezählt, sobald die Zuordnung ihn irgendwo
 * überlappt, wäre die Quote systematisch ZU HOCH — und zwar in genau der
 * Richtung, in der sie gegenüber der Bewilligungsbehörde günstig aussieht.
 *
 * Grundlage ist `measurement.messwert_tag`, der Stufe-B-Bestand: DE-02/TB-09
 * verlangen Tagesgranularität, und die Quote soll auf demselben Bestand
 * rechnen wie der Nachweis.
 */
const VERBRAUCH_RUMPF = `
    FROM energy.messkanal mk
    JOIN energy.zaehler z ON z.id = mk.zaehler_id
    JOIN energy.system s ON s.id = z.system_id
    JOIN measurement.messwert_tag t ON t.messkanal_key = mk.kanal_key
    ${ZUORDNUNG_AM_TAG}
   WHERE s.endkunde_id = $1
     AND z.energietraeger = $2
     AND t.tag >= $3::date
     AND t.tag <  $4::date`;

/**
 * Derselbe Rumpf ueber eine PAARMENGE statt ueber ein Paar — fuer den
 * Exportpfad (V0064). `unnest` mit zwei Arrays bildet die Paare exakt ab;
 * zwei unabhaengige `ANY`-Filter ergaeben das Kreuzprodukt.
 */
const PAAR_RUMPF = `
    FROM unnest($1::uuid[], $2::text[]) AS scope(endkunde_id, energietraeger)
    JOIN energy.system s ON s.endkunde_id = scope.endkunde_id
    JOIN energy.zaehler z ON z.system_id = s.id AND z.energietraeger = scope.energietraeger
    JOIN energy.messkanal mk ON mk.zaehler_id = z.id
    JOIN measurement.messwert_tag t ON t.messkanal_key = mk.kanal_key
    ${ZUORDNUNG_AM_TAG}
   WHERE t.tag >= $3::date
     AND t.tag <  $4::date`;

@Injectable()
export class GeraeteerkennungRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async findGruppen(endkundeId: string): Promise<GeraetegruppeItem[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT id, endkunde_id, bezeichnung, beschreibung
         FROM energy.geraetegruppe WHERE endkunde_id = $1 ORDER BY bezeichnung`,
      [endkundeId],
    );

    return mapManyRows(
      bindRows<{
        readonly id: string;
        readonly endkunde_id: string;
        readonly bezeichnung: string;
        readonly beschreibung: string | null;
      }>(rawRows),
      (row) => ({
        id: row.id,
        endkundeId: row.endkunde_id,
        bezeichnung: row.bezeichnung,
        beschreibung: row.beschreibung,
      }),
    );
  }

  async findGruppeById(id: string): Promise<GeraetegruppeItem | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT id, endkunde_id, bezeichnung, beschreibung FROM energy.geraetegruppe WHERE id = $1`,
      [id],
    );

    return mapOneRow(
      bindRows<{
        readonly id: string;
        readonly endkunde_id: string;
        readonly bezeichnung: string;
        readonly beschreibung: string | null;
      }>(rawRows),
      (row) => ({
        id: row.id,
        endkundeId: row.endkunde_id,
        bezeichnung: row.bezeichnung,
        beschreibung: row.beschreibung,
      }),
    );
  }

  async insertGruppe(input: {
    readonly id: string;
    readonly endkundeId: string;
    readonly bezeichnung: string;
    readonly beschreibung: string | undefined;
  }): Promise<void> {
    await this.txHost.tx.query(
      `INSERT INTO energy.geraetegruppe (id, endkunde_id, bezeichnung, beschreibung)
       VALUES ($1, $2, $3, $4)`,
      [input.id, input.endkundeId, input.bezeichnung, input.beschreibung ?? null],
    );
  }

  async findZuordnungen(endkundeId: string): Promise<ZuordnungItem[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT k.geraetegruppe_id, g.bezeichnung, k.messkanal_id, k.methode, k.genauigkeit_pct,
              k.anteil_prozent, mk.ist_untermessung, k.gueltig_von, k.gueltig_bis,
              k.beendet_grund
         FROM energy.geraetegruppe_kanal k
         JOIN energy.geraetegruppe g ON g.id = k.geraetegruppe_id
         JOIN energy.messkanal mk ON mk.id = k.messkanal_id
        WHERE g.endkunde_id = $1
        ORDER BY g.bezeichnung, k.gueltig_von DESC`,
      [endkundeId],
    );

    return mapManyRows(
      bindRows<{
        readonly geraetegruppe_id: string;
        readonly bezeichnung: string;
        readonly messkanal_id: string;
        readonly methode: string;
        readonly genauigkeit_pct: string | null;
        readonly anteil_prozent: string;
        readonly ist_untermessung: boolean;
        readonly gueltig_von: unknown;
        readonly gueltig_bis: unknown;
        readonly beendet_grund: string | null;
      }>(rawRows),
      (row) => ({
        geraetegruppeId: row.geraetegruppe_id,
        geraetegruppeBezeichnung: row.bezeichnung,
        messkanalId: row.messkanal_id,
        methode: row.methode as Erkennungsmethode,
        genauigkeitPct: row.genauigkeit_pct === null ? null : Number.parseFloat(row.genauigkeit_pct),
        anteilProzent: Number.parseFloat(row.anteil_prozent),
        // Seit V0058 eine Eigenschaft des KANALS, keine der Zuordnung — in der
        // Antwort bleibt sie stehen, weil die Betriebssicht sie zeigt.
        imGesamtverbrauchEnthalten: row.ist_untermessung,
        // `toIsoDateString` statt `.toISOString().slice(0, 10)`: `pg`
        // konstruiert fuer SQL-`date` LOKALE Mitternacht, ein naives
        // `toISOString()` liefert oestlich von Greenwich den VORTAG (s.
        // `stammdaten/persistence/pg-date.util.ts`). Der Integrationstest
        // dieses Moduls ist genau darueber gestolpert: Die Zuordnung war
        // geschrieben, aber der Rueckvergleich `gueltigVon` schlug fehl.
        gueltigVon: toIsoDateString(row.gueltig_von),
        gueltigBis: toIsoDateStringOrNull(row.gueltig_bis),
        beendetGrund: row.beendet_grund,
        wirksam: row.gueltig_bis === null,
      }),
    );
  }

  async insertZuordnung(input: ZuordnungAnlegenInput): Promise<void> {
    await this.txHost.tx.query(
      `INSERT INTO energy.geraetegruppe_kanal
             (geraetegruppe_id, messkanal_id, methode, genauigkeit_pct, anteil_prozent, gueltig_von)
       VALUES ($1, $2, $3, $4, $5, $6::date)`,
      [
        input.geraetegruppeId,
        input.messkanalId,
        input.methode,
        input.genauigkeitPct ?? null,
        input.anteilProzent,
        input.gueltigVon,
      ],
    );
  }

  /**
   * Beendet die WIRKSAME Zuordnung eines Kanals zu einer Gruppe.
   *
   * `WHERE gueltig_bis IS NULL` — eine bereits beendete Zuordnung wird nicht
   * ein zweites Mal beendet; sonst verschöbe sich der Zeitpunkt, ab dem ihr
   * Verbrauch nicht mehr zählt, und mit ihm die Quote der Vergangenheit.
   */
  async beendeZuordnung(input: {
    readonly geraetegruppeId: string;
    readonly messkanalId: string;
    readonly gueltigBis: string;
    readonly grund: string;
  }): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.geraetegruppe_kanal
          SET gueltig_bis = $3::date, beendet_grund = $4
        WHERE geraetegruppe_id = $1 AND messkanal_id = $2 AND gueltig_bis IS NULL
        RETURNING messkanal_id`,
      [input.geraetegruppeId, input.messkanalId, input.gueltigBis, input.grund],
    );

    // `bindReturningRows`, NICHT `bindRows`: TypeORM liefert fuer UPDATE/
    // DELETE ein Tupel [rows, rowCount] (s. `map-row.ts`). Mit `bindRows`
    // haette dieses Beenden IMMER „nicht gefunden" gemeldet.
    return bindReturningRows<{ readonly messkanal_id: string }>(rawRows).length === 1;
  }

  /**
   * Gesamt- und zugeordneter Verbrauch im Zeitraum.
   *
   * **Die beiden Filter sind die eigentliche Aussage.**
   *
   * `zugeordnet` zählt jeden Tag, an dem eine Zuordnung galt, mit dem
   * jeweiligen Anteil.
   *
   * `gesamt` zählt nur Kanäle, die KEINE Untermessung sind
   * (`energy.messkanal.ist_untermessung`, V0058). Der Verbrauch einer
   * Untermessung steckt bereits in der Hauptmessung; zählte man beide, wäre
   * derselbe Strom zweimal im Nenner und die Quote systematisch zu niedrig.
   *
   * **Die Topologie kommt seit V0058 vom KANAL, nicht mehr von der
   * Zuordnung.** Das ändert die Zahl in einem Fall, und der ist der richtige:
   * Ein Unterzähler OHNE Gruppenzuordnung blähte den Nenner vorher auf, weil
   * die Bedingung `zu.geraetegruppe_id IS NULL` ihn wie eine Hauptmessung
   * behandelte. Wer nur einen Teil seiner Untermessungen zugeordnet hatte,
   * bekam dadurch eine zu niedrige Quote ausgewiesen.
   */
  async summiereVerbrauch(
    endkundeId: string,
    energietraeger: string,
    vonTag: string,
    bisTag: string,
  ): Promise<VerbrauchsSummen> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT
          COALESCE(SUM(t.verbrauch_kwh) FILTER (
            WHERE NOT mk.ist_untermessung
          ), 0)::float8 AS gesamt_kwh,
          COALESCE(SUM(t.verbrauch_kwh * zu.anteil_prozent / 100) FILTER (
            WHERE zu.geraetegruppe_id IS NOT NULL
          ), 0)::float8 AS zugeordnet_kwh,
          count(*)::int AS tage_mit_werten
       ${VERBRAUCH_RUMPF}`,
      [endkundeId, energietraeger, vonTag, bisTag],
    );

    return (
      mapOneRow(
        bindRows<{
          readonly gesamt_kwh: number;
          readonly zugeordnet_kwh: number;
          readonly tage_mit_werten: number;
        }>(rawRows),
        (row) => ({
          gesamtKwh: row.gesamt_kwh,
          zugeordnetKwh: row.zugeordnet_kwh,
          tageMitWerten: row.tage_mit_werten,
        }),
      ) ?? { gesamtKwh: 0, zugeordnetKwh: 0, tageMitWerten: 0 }
    );
  }

  /**
   * Der zugeordnete Verbrauch JE GRUPPE — die Aufteilung, die [Q3] Kap. 6
   * für die Nutzerinformation verlangt („getrennt nach jeweiligen Gruppen").
   */
  async summiereJeGruppe(
    endkundeId: string,
    energietraeger: string,
    vonTag: string,
    bisTag: string,
  ): Promise<{ readonly geraetegruppeId: string; readonly bezeichnung: string; readonly kwh: number }[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT zu.geraetegruppe_id, zu.bezeichnung,
              SUM(t.verbrauch_kwh * zu.anteil_prozent / 100)::float8 AS kwh
       ${VERBRAUCH_RUMPF}
         AND zu.geraetegruppe_id IS NOT NULL
       GROUP BY zu.geraetegruppe_id, zu.bezeichnung
       ORDER BY kwh DESC`,
      [endkundeId, energietraeger, vonTag, bisTag],
    );

    return mapManyRows(
      bindRows<{ readonly geraetegruppe_id: string; readonly bezeichnung: string; readonly kwh: number }>(
        rawRows,
      ),
      (row) => ({ geraetegruppeId: row.geraetegruppe_id, bezeichnung: row.bezeichnung, kwh: row.kwh }),
    );
  }

  /** Systeme des Endkunden — insgesamt und davon als entbehrlich vermerkt (Kap. 5). */
  async zaehleSysteme(endkundeId: string): Promise<{ readonly gesamt: number; readonly entbehrlich: number }> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT count(*)::int AS gesamt,
              count(*) FILTER (WHERE geraeteerkennung_entbehrlich)::int AS entbehrlich
         FROM energy.system WHERE endkunde_id = $1`,
      [endkundeId],
    );

    return (
      mapOneRow(
        bindRows<{ readonly gesamt: number; readonly entbehrlich: number }>(rawRows),
        (row) => ({ gesamt: row.gesamt, entbehrlich: row.entbehrlich }),
      ) ?? { gesamt: 0, entbehrlich: 0 }
    );
  }

  /**
   * Der aktuelle Stand der Entbehrlichkeits-Feststellung EINES Systems.
   *
   * Ohne diese Lese-Moeglichkeit waere `setzeEntbehrlich` schreib-only: Die
   * Betriebssicht koennte ein Haekchen setzen, aber nicht zeigen, ob schon
   * eines gesetzt IST — und der naechste Bearbeiter uebersaehe eine
   * bestehende Feststellung samt ihrer Begruendung.
   */
  async findEntbehrlich(
    systemId: string,
  ): Promise<{ readonly entbehrlich: boolean; readonly grund: string | null } | null> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT geraeteerkennung_entbehrlich       AS entbehrlich,
              geraeteerkennung_entbehrlich_grund AS grund
         FROM energy.system WHERE id = $1`,
      [systemId],
    );

    return (
      mapOneRow(
        bindRows<{ readonly entbehrlich: boolean; readonly grund: string | null }>(rawRows),
        (row) => ({ entbehrlich: row.entbehrlich, grund: row.grund }),
      ) ?? null
    );
  }

  async setzeEntbehrlich(systemId: string, entbehrlich: boolean, grund: string | undefined): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.system
          SET geraeteerkennung_entbehrlich = $2,
              geraeteerkennung_entbehrlich_grund = $3,
              updated_at = now()
        WHERE id = $1
        RETURNING id`,
      [systemId, entbehrlich, entbehrlich ? (grund ?? null) : null],
    );

    return bindReturningRows<{ readonly id: string }>(rawRows).length === 1;
  }

  /**
   * Die Quotenzahlen fuer MEHRERE (Endkunde, Energietraeger)-Paare in EINER
   * Abfrage — der Weg, auf dem die Quote in den BAFA-Export kommt (TB-05,
   * Exportschema v2 / V0064).
   *
   * **Warum hier und nicht im Nachweis-Modul.** Es ist dieselbe Quote, die
   * der Betrieb sieht und die im Kundendokument steht. Eine zweite Abfrage
   * im Exportpfad waere die zweite Wahrheit, die irgendwann abweicht — und
   * die Stelle, an der sie abweicht, waere ausgerechnet der Nachweis
   * gegenueber der Bewilligungsbehoerde. Der Rumpf ist deshalb wortgleich
   * derselbe (`VERBRAUCH_RUMPF`), nur ueber eine Paarmenge statt ueber ein
   * Paar.
   *
   * Der Umfang wird als PAARMENGE uebergeben und per `unnest` gejoint, NICHT
   * als zwei unabhaengige `ANY`-Filter: Sonst entstuende das Kreuzprodukt,
   * und ein Endkunde bekaeme Zahlen fuer einen Energietraeger, der gar nicht
   * im Export ist.
   */
  async summiereVerbrauchFuerPaare(
    paare: readonly { readonly endkundeId: string; readonly energietraeger: string }[],
    vonTag: string,
    bisTag: string,
  ): Promise<
    {
      readonly endkundeId: string;
      readonly energietraeger: string;
      readonly gesamtKwh: number;
      readonly zugeordnetKwh: number;
      readonly tageMitWerten: number;
    }[]
  > {
    if (paare.length === 0) {
      return [];
    }
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT s.endkunde_id, z.energietraeger,
              COALESCE(SUM(t.verbrauch_kwh) FILTER (WHERE NOT mk.ist_untermessung), 0)::float8 AS gesamt_kwh,
              COALESCE(SUM(t.verbrauch_kwh * zu.anteil_prozent / 100) FILTER (
                WHERE zu.geraetegruppe_id IS NOT NULL
              ), 0)::float8 AS zugeordnet_kwh,
              count(*)::int AS tage_mit_werten
         ${PAAR_RUMPF}
        GROUP BY s.endkunde_id, z.energietraeger`,
      [paare.map((p) => p.endkundeId), paare.map((p) => p.energietraeger), vonTag, bisTag],
    );

    return mapManyRows(
      bindRows<{
        readonly endkunde_id: string;
        readonly energietraeger: string;
        readonly gesamt_kwh: number;
        readonly zugeordnet_kwh: number;
        readonly tage_mit_werten: number;
      }>(rawRows),
      (row) => ({
        endkundeId: row.endkunde_id,
        energietraeger: row.energietraeger,
        gesamtKwh: row.gesamt_kwh,
        zugeordnetKwh: row.zugeordnet_kwh,
        tageMitWerten: row.tage_mit_werten,
      }),
    );
  }

  /**
   * Der zugeordnete Verbrauch je (Paar, Gruppe, ERKENNUNGSMETHODE) — die
   * „Zuordnungs-Metadaten je Verbrauchsanteil", die [Q3] Kap. 5 ausdruecklich
   * verlangt.
   *
   * **Warum die Methode Teil der Gruppierung ist.** Eine Gruppe kann ueber
   * mehrere Kanaele zugeordnet sein, und die koennen verschieden erkannt
   * worden sein — einer direkt gemessen, einer geschaetzt. Eine Zeile je
   * Gruppe muesste sich dann fuer EINE Methode entscheiden und wuerde die
   * andere verschweigen. Genau der Unterschied ist aber, was die Behoerde
   * wissen will: eine gemessene Zuordnung ist etwas anderes als eine
   * gerechnete.
   *
   * **Die Genauigkeit ist das MINIMUM der beitragenden Zuordnungen**, nicht
   * ihr Mittel: dieselbe „restriktivste Aufloesung bei Mehrdeutigkeit"-Linie
   * wie bei der Tagesklassifikation der Berechnung. Ein Durchschnitt liesse
   * eine schlechte Zuordnung hinter einer guten verschwinden.
   *
   * NICHT enthalten: der Messkanal. Er waere die naechste Kennung im Export
   * und haengt an der A12-Freigabe (Rohdaten) — die Quote haengt an ihr
   * nicht, und sie soll es auch nicht.
   */
  async summiereJeGruppeUndMethodeFuerPaare(
    paare: readonly { readonly endkundeId: string; readonly energietraeger: string }[],
    vonTag: string,
    bisTag: string,
  ): Promise<
    {
      readonly endkundeId: string;
      readonly energietraeger: string;
      readonly geraetegruppeId: string;
      readonly bezeichnung: string;
      readonly methode: string;
      readonly zugeordnetKwh: number;
      readonly genauigkeitPctMin: number | null;
    }[]
  > {
    if (paare.length === 0) {
      return [];
    }
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT s.endkunde_id, z.energietraeger, zu.geraetegruppe_id, zu.bezeichnung, zu.methode,
              SUM(t.verbrauch_kwh * zu.anteil_prozent / 100)::float8 AS zugeordnet_kwh,
              MIN(zu.genauigkeit_pct)::float8 AS genauigkeit_pct_min
         ${PAAR_RUMPF}
          AND zu.geraetegruppe_id IS NOT NULL
        GROUP BY s.endkunde_id, z.energietraeger, zu.geraetegruppe_id, zu.bezeichnung, zu.methode
        ORDER BY s.endkunde_id, z.energietraeger, zu.geraetegruppe_id, zu.methode`,
      [paare.map((p) => p.endkundeId), paare.map((p) => p.energietraeger), vonTag, bisTag],
    );

    return mapManyRows(
      bindRows<{
        readonly endkunde_id: string;
        readonly energietraeger: string;
        readonly geraetegruppe_id: string;
        readonly bezeichnung: string;
        readonly methode: string;
        readonly zugeordnet_kwh: number;
        readonly genauigkeit_pct_min: number | null;
      }>(rawRows),
      (row) => ({
        endkundeId: row.endkunde_id,
        energietraeger: row.energietraeger,
        geraetegruppeId: row.geraetegruppe_id,
        bezeichnung: row.bezeichnung,
        methode: row.methode,
        zugeordnetKwh: row.zugeordnet_kwh,
        genauigkeitPctMin: row.genauigkeit_pct_min,
      }),
    );
  }

  /** Systeme MEHRERER Endkunden — insgesamt und davon entbehrlich (Kap. 5, Exportpfad). */
  async zaehleSystemeFuerEndkunden(
    endkundeIds: readonly string[],
  ): Promise<{ readonly endkundeId: string; readonly gesamt: number; readonly entbehrlich: number }[]> {
    if (endkundeIds.length === 0) {
      return [];
    }
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT endkunde_id, count(*)::int AS gesamt,
              count(*) FILTER (WHERE geraeteerkennung_entbehrlich)::int AS entbehrlich
         FROM energy.system WHERE endkunde_id = ANY($1::uuid[])
        GROUP BY endkunde_id`,
      [[...endkundeIds]],
    );

    return mapManyRows(
      bindRows<{ readonly endkunde_id: string; readonly gesamt: number; readonly entbehrlich: number }>(rawRows),
      (row) => ({ endkundeId: row.endkunde_id, gesamt: row.gesamt, entbehrlich: row.entbehrlich }),
    );
  }
}
