import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import { toIsoDateString } from '../../stammdaten/persistence/pg-date.util';
import type { NutzerinformationItem, QualitaetsStufe, Zustellweg } from '../nutzerinfo.types';

interface InformationRow {
  readonly id: string;
  readonly endkunde_id: string;
  readonly energietraeger: string;
  readonly monat: Date;
  readonly berechnungslauf_id: string;
  readonly referenz_kwh: string;
  readonly ist_kwh: string;
  readonly delta_kwh: string;
  readonly qualitaets_stufe: string;
  readonly abdeckung_pct: string;
  readonly tage_fehlend: number;
  readonly kandidaten_anzahl: number;
  readonly inhalt_hash: Buffer;
  readonly erzeugt_at: Date;
  readonly zugestellt_at: Date | null;
  readonly zustellweg: string | null;
}

/** Ein (Endkunde, Energieträger)-Paar, für das es im Monat einen Lauf geben könnte. */
export interface KandidatenPaar {
  readonly endkundeId: string;
  readonly energietraeger: string;
  readonly verarbeitungsStatus: string;
  /** `true`, wenn ein WIRKSAMER Widerspruch gegen `nutzerinformation` vorliegt. */
  readonly hatWiderspruch: boolean;
}

export interface InformationSchreibenInput {
  readonly id: string;
  readonly endkundeId: string;
  readonly energietraeger: string;
  readonly monat: string;
  readonly berechnungslaufId: string;
  readonly referenzKwh: number;
  readonly istKwh: number;
  readonly deltaKwh: number;
  readonly qualitaetsStufe: QualitaetsStufe;
  readonly abdeckungPct: number;
  readonly tageFehlend: number;
  readonly kandidatenAnzahl: number;
  readonly inhaltHash: Buffer;
}

const SPALTEN = `id, endkunde_id, energietraeger, monat, berechnungslauf_id,
       referenz_kwh, ist_kwh, delta_kwh, qualitaets_stufe, abdeckung_pct,
       tage_fehlend, kandidaten_anzahl, inhalt_hash, erzeugt_at, zugestellt_at, zustellweg`;

function abbilden(row: InformationRow): NutzerinformationItem {
  return {
    id: row.id,
    endkundeId: row.endkunde_id,
    energietraeger: row.energietraeger,
    // s. `stammdaten/persistence/pg-date.util.ts`: `pg` konstruiert fuer
    // SQL-`date` LOKALE Mitternacht — ein naives `toISOString()` liefert
    // oestlich von Greenwich den VORTAG und damit den falschen Berichtsmonat.
    monat: toIsoDateString(row.monat),
    berechnungslaufId: row.berechnungslauf_id,
    referenzKwh: Number.parseFloat(row.referenz_kwh),
    istKwh: Number.parseFloat(row.ist_kwh),
    deltaKwh: Number.parseFloat(row.delta_kwh),
    qualitaetsStufe: row.qualitaets_stufe as QualitaetsStufe,
    abdeckungPct: Number.parseFloat(row.abdeckung_pct),
    tageFehlend: row.tage_fehlend,
    kandidatenAnzahl: row.kandidaten_anzahl,
    inhaltHashHex: row.inhalt_hash.toString('hex'),
    erzeugtAt: row.erzeugt_at.toISOString(),
    zugestelltAt: row.zugestellt_at?.toISOString() ?? null,
    zustellweg: (row.zustellweg as Zustellweg | null) ?? null,
  };
}

@Injectable()
export class NutzerinfoRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * Alle (Endkunde, Energieträger)-Paare, für die im Monat überhaupt ein
   * Berechnungslauf in Frage kommt — samt der beiden Gründe, aus denen ein
   * Kunde NICHT informiert werden darf.
   *
   * Die beiden Gründe kommen bewusst aus DERSELBEN Abfrage und nicht aus
   * nachgelagerten Einzelprüfungen: Ein Lauf soll je Paar genau eine Aussage
   * treffen, und ein Kunde, der zwischen zwei Abfragen widerspricht, soll
   * nicht in einem inkonsistenten Zwischenzustand landen.
   *
   * Überholte Läufe fallen schon hier heraus — dieselbe Vorauswahl, die
   * `AnalyticsLaufLookupRepository.findKandidatenFuerMonat` trifft; sonst
   * zählte ein Paar mit, dessen einziger Lauf längst ersetzt ist.
   *
   * Der Anti-Join ist Absicht: `ersetzt_lauf_id` steht am NEUEN Lauf und
   * zeigt auf den alten. `ersetzt_lauf_id IS NULL` behielt daher den
   * ÜBERHOLTEN Lauf und schloss die KORREKTUR aus — genau verkehrt herum.
   */
  async findKandidatenPaare(monat: string): Promise<KandidatenPaar[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT DISTINCT
              bl.endkunde_id,
              bl.energietraeger,
              e.verarbeitungs_status,
              EXISTS (
                SELECT 1 FROM consent.widerspruch w
                 WHERE w.endkunde_id = bl.endkunde_id
                   AND w.zweck_code = 'nutzerinformation'
                   AND w.zurueckgenommen_at IS NULL
              ) AS hat_widerspruch
         FROM analytics.berechnungslauf bl
         JOIN energy.endkunde e ON e.id = bl.endkunde_id
        WHERE bl.periode_von <= $1::date
          AND bl.periode_bis >  $1::date
          AND NOT EXISTS (
            SELECT 1 FROM analytics.berechnungslauf nachfolger WHERE nachfolger.ersetzt_lauf_id = bl.id
          )
        ORDER BY bl.endkunde_id, bl.energietraeger`,
      [monat],
    );

    return mapManyRows(
      bindRows<{
        readonly endkunde_id: string;
        readonly energietraeger: string;
        readonly verarbeitungs_status: string;
        readonly hat_widerspruch: boolean;
      }>(rawRows),
      (row) => ({
        endkundeId: row.endkunde_id,
        energietraeger: row.energietraeger,
        verarbeitungsStatus: row.verarbeitungs_status,
        hatWiderspruch: row.hat_widerspruch,
      }),
    );
  }

  /**
   * Schreibt eine Information — und lässt eine bereits ZUGESTELLTE unberührt.
   *
   * **Das ist die wichtigste Zeile dieser Datei.** Eine Nachlauf-Korrektur
   * ändert später den Berechnungslauf; ein erneuter Erzeugungslauf würde die
   * Zahlen dann still überschreiben. Für eine Information, die der Kunde noch
   * nicht bekommen hat, ist das richtig — die neuere Rechnung ist die bessere.
   * Für eine bereits zugestellte ist es falsch: Er hat gesehen, was er gesehen
   * hat, und der Nachweis muss das aushalten. Eine Korrektur nach der
   * Zustellung ist ein eigener Vorgang (Berichtigung), kein stilles `UPDATE`.
   *
   * Rückgabe: `true`, wenn geschrieben wurde.
   */
  async schreibe(input: InformationSchreibenInput): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO nutzerinfo.information
             (id, endkunde_id, energietraeger, monat, berechnungslauf_id,
              referenz_kwh, ist_kwh, delta_kwh, qualitaets_stufe, abdeckung_pct,
              tage_fehlend, kandidaten_anzahl, inhalt_hash)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (endkunde_id, energietraeger, monat) DO UPDATE
          SET berechnungslauf_id = EXCLUDED.berechnungslauf_id,
              referenz_kwh       = EXCLUDED.referenz_kwh,
              ist_kwh            = EXCLUDED.ist_kwh,
              delta_kwh          = EXCLUDED.delta_kwh,
              qualitaets_stufe   = EXCLUDED.qualitaets_stufe,
              abdeckung_pct      = EXCLUDED.abdeckung_pct,
              tage_fehlend       = EXCLUDED.tage_fehlend,
              kandidaten_anzahl  = EXCLUDED.kandidaten_anzahl,
              inhalt_hash        = EXCLUDED.inhalt_hash,
              erzeugt_at         = now()
        WHERE nutzerinfo.information.zugestellt_at IS NULL
       RETURNING id`,
      [
        input.id,
        input.endkundeId,
        input.energietraeger,
        input.monat,
        input.berechnungslaufId,
        input.referenzKwh,
        input.istKwh,
        input.deltaKwh,
        input.qualitaetsStufe,
        input.abdeckungPct,
        input.tageFehlend,
        input.kandidatenAnzahl,
        input.inhaltHash,
      ],
    );

    return bindRows<{ readonly id: string }>(rawRows).length === 1;
  }

  /**
   * Abdeckung und fehlende Tage des GEWÄHLTEN Laufs.
   *
   * Sie stehen in `analytics.laufergebnis`, aber nicht in der
   * Kandidaten-Abfrage des Nachweis-Moduls — die braucht sie nicht. Statt
   * jene Abfrage zu erweitern (sie ist geteilter Code des BAFA-Pfads), holt
   * dieser Nachschlag sie für den einen Lauf, der bereits feststeht.
   *
   * Sie gehören in die Kundeninformation, weil TB-06 „nachvollziehbar"
   * verlangt: Eine Einsparung aus einem Monat mit acht fehlenden Tagen ist
   * eine andere Aussage als eine aus einem vollständigen.
   */
  async findGuete(
    berechnungslaufId: string,
    monat: string,
  ): Promise<{ readonly abdeckungPct: number; readonly tageFehlend: number } | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT abdeckung_pct, tage_fehlend
         FROM analytics.laufergebnis
        WHERE lauf_id = $1 AND monat = $2::date`,
      [berechnungslaufId, monat],
    );

    return mapOneRow(
      bindRows<{ readonly abdeckung_pct: string; readonly tage_fehlend: number }>(rawRows),
      (row) => ({ abdeckungPct: Number.parseFloat(row.abdeckung_pct), tageFehlend: row.tage_fehlend }),
    );
  }

  /**
   * Der Stand eines Monats: erzeugt, davon zugestellt.
   *
   * EINE Abfrage statt zweier Zaehlungen — die beiden Zahlen muessen aus
   * demselben Augenblick stammen, sonst kann „3 von 5 zugestellt" entstehen,
   * waehrend gerade eine vierte dazukommt.
   */
  async zaehleMonatsstand(monat: string): Promise<{ readonly erzeugt: number; readonly zugestellt: number }> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT count(*)::int AS erzeugt,
              count(*) FILTER (WHERE zugestellt_at IS NOT NULL)::int AS zugestellt
         FROM nutzerinfo.information
        WHERE monat = $1::date`,
      [monat],
    );

    return (
      mapOneRow(
        bindRows<{ readonly erzeugt: number; readonly zugestellt: number }>(rawRows),
        (row) => ({ erzeugt: row.erzeugt, zugestellt: row.zugestellt }),
      ) ?? { erzeugt: 0, zugestellt: 0 }
    );
  }

  async findById(id: string): Promise<NutzerinformationItem | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SPALTEN} FROM nutzerinfo.information WHERE id = $1`,
      [id],
    );
    return mapOneRow(bindRows<InformationRow>(rawRows), abbilden);
  }

  /** Der Verlauf eines Endkunden — die Ansicht, die ein Portal später zeigt. */
  /**
   * Die Information desselben Paares aus dem VORMONAT.
   *
   * Bewusst die zugestellte Information und nicht eine Neuberechnung: Der
   * Vergleich im Bericht soll dem gegenueberstellen, was der Kunde damals
   * TATSAECHLICH gelesen hat. Eine nachtraeglich korrigierte Zahl an dieser
   * Stelle liesse ihn eine Veraenderung sehen, die es nie gab.
   */
  async findVormonat(
    endkundeId: string,
    energietraeger: string,
    monat: string,
  ): Promise<NutzerinformationItem | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SPALTEN}
         FROM nutzerinfo.information
        WHERE endkunde_id = $1
          AND energietraeger = $2
          AND monat = ($3::date - interval '1 month')::date`,
      [endkundeId, energietraeger, monat],
    );
    return mapOneRow(bindRows<InformationRow>(rawRows), abbilden);
  }

  async findFuerEndkunde(endkundeId: string, limit: number): Promise<NutzerinformationItem[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SPALTEN} FROM nutzerinfo.information
        WHERE endkunde_id = $1
        ORDER BY monat DESC, energietraeger ASC
        LIMIT $2`,
      [endkundeId, limit],
    );
    return mapManyRows(bindRows<InformationRow>(rawRows), abbilden);
  }

  /**
   * Vermerkt die Zustellung.
   *
   * `WHERE zugestellt_at IS NULL` — eine zweite Zustellung überschreibt den
   * ersten Zeitpunkt nicht. Er ist der Nachweis, dass die Auflage in DIESEM
   * Monat erfüllt wurde; ein späterer Zeitpunkt an seiner Stelle verschöbe
   * genau die Aussage, um die es geht.
   */
  async vermerkeZustellung(id: string, zugestelltAt: Date, zustellweg: Zustellweg): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE nutzerinfo.information
          SET zugestellt_at = $2, zustellweg = $3
        WHERE id = $1 AND zugestellt_at IS NULL
        RETURNING id`,
      [id, zugestelltAt, zustellweg],
    );
    // `bindReturningRows`, NICHT `bindRows`: TypeORM liefert fuer UPDATE ein
    // Tupel [rows, rowCount] (s. `map-row.ts`). Mit `bindRows` haette das
    // Vermerken der Zustellung IMMER „nicht gefunden" gemeldet.
    return bindReturningRows<{ readonly id: string }>(rawRows).length === 1;
  }

  /**
   * Alle Informationen EINES Monats — die Grundlage der Versandmappe.
   *
   * Sortiert nach Endkunde und Energieträger, damit die Mappe bei jedem
   * Aufruf dieselbe Blattreihenfolge hat: Wer eine gedruckte Mappe mit einer
   * neu erzeugten vergleicht, soll nicht Seiten suchen müssen.
   */
  async findByMonat(monat: string): Promise<NutzerinformationItem[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SPALTEN}
         FROM nutzerinfo.information
        WHERE monat = $1::date
        ORDER BY endkunde_id ASC, energietraeger ASC`,
      [monat],
    );
    return mapManyRows(bindRows<InformationRow>(rawRows), abbilden);
  }

  /** Die noch NICHT zugestellten Informationen eines Monats — der Arbeitsvorrat des Versands. */
  async findUnzugestellteByMonat(monat: string): Promise<NutzerinformationItem[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SPALTEN}
         FROM nutzerinfo.information
        WHERE monat = $1::date AND zugestellt_at IS NULL
        ORDER BY endkunde_id ASC, energietraeger ASC`,
      [monat],
    );
    return mapManyRows(bindRows<InformationRow>(rawRows), abbilden);
  }

  /**
   * Welche der übergebenen Berechnungsläufe tatsächlich mit DWD-Klimadaten
   * gerechnet haben.
   *
   * Steuert den Quellenvermerk auf dem Kundendokument (Auflage A-2). Die
   * Frage ist NICHT „ist der DWD-Adapter gebunden", sondern „steckt in
   * DIESEM Lauf ein DWD-Wert" — ein alter Lauf aus der Zeit des
   * synthetischen Adapters darf keinen Vermerk bekommen, auch wenn die
   * Instanz inzwischen real abruft.
   *
   * Der Join geht über `(station_ref, tag, t_mittel)` gegen den laufenden
   * Vorrat, weil der eingefrorene Snapshot keine Herkunft trägt — dasselbe
   * Muster und dieselbe sichere Richtung wie in
   * `AnalyticsExportLaufRepository.hatNichtSynthetischeKlimaquelle()`: im
   * Zweifel KEINE Attribution statt einer behaupteten.
   */
  async findLaeufeMitDwdKlima(berechnungslaufIds: readonly string[]): Promise<Set<string>> {
    if (berechnungslaufIds.length === 0) {
      return new Set();
    }
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT DISTINCT bl.id
         FROM analytics.berechnungslauf bl
         JOIN analytics.eingang_klima_tag ekt ON ekt.snapshot_id = bl.klima_snapshot_id
         JOIN analytics.klima_tag kt
           ON kt.station_ref = ekt.station_ref AND kt.tag = ekt.tag AND kt.t_mittel = ekt.t_mittel
        WHERE bl.id = ANY($1::uuid[]) AND kt.quelle NOT LIKE 'synthetic%'`,
      [[...berechnungslaufIds]],
    );
    return new Set(bindRows<{ readonly id: string }>(rawRows).map((row) => row.id));
  }
}
