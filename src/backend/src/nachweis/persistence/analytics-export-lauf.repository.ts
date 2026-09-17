import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows } from '../../stammdaten/persistence/map-row';
import { toIsoDateString, toIsoDateStringOrNull } from '../../berechnung/persistence/pg-date.util';
import type { RenderBerechnungslauf, RenderKlimaTag } from '../export/nachweis-export-renderer';

interface BerechnungslaufDbRow {
  readonly id: string;
  readonly endkunde_id: string;
  readonly energietraeger: string;
  readonly periode_von: unknown;
  readonly periode_bis: unknown;
  readonly station_ref: string;
  readonly messwert_snapshot_id: string;
  readonly klima_snapshot_id: string;
  readonly einflussgroesse_snapshot_id: string | null;
  readonly verfahren_code: string;
  readonly verfahren_version: number;
  readonly parameter: unknown;
  readonly parameter_hash: Buffer;
  readonly rohdaten_hash: Buffer;
  readonly baseline_wert_kwh: string;
  readonly grundlast_anteil: string;
  readonly gtz_base: string;
  readonly gtz_norm: string | null;
  readonly baseline_norm_kwh: string | null;
  readonly messkonzept_typ: string;
  readonly guete_r2: string | null;
  readonly guete_cv_rmse_pct: string | null;
  readonly guete_nmbe_pct: string | null;
  readonly guete_punkte: number | null;
  readonly baseline_abweichung_pct: string | null;
  readonly qualitaets_stufe_min: string;
}

export interface BerechnungslaufExportZeile extends RenderBerechnungslauf {
  readonly messwertSnapshotId: string;
  readonly klimaSnapshotId: string;
}

function mapBerechnungslaufRow(row: BerechnungslaufDbRow): BerechnungslaufExportZeile {
  return {
    berechnungslaufId: row.id,
    endkundeId: row.endkunde_id,
    energietraeger: row.energietraeger,
    periodeVon: toIsoDateString(row.periode_von),
    periodeBis: toIsoDateString(row.periode_bis),
    stationRef: row.station_ref,
    messwertSnapshotId: row.messwert_snapshot_id,
    klimaSnapshotId: row.klima_snapshot_id,
    einflussgroesseSnapshotId: row.einflussgroesse_snapshot_id,
    verfahrenCode: row.verfahren_code,
    verfahrenVersion: row.verfahren_version,
    parameter: row.parameter as Record<string, unknown>,
    parameterHashHex: row.parameter_hash.toString('hex'),
    rohdatenHashHex: row.rohdaten_hash.toString('hex'),
    baselineWertKwh: Number.parseFloat(row.baseline_wert_kwh),
    grundlastAnteil: Number.parseFloat(row.grundlast_anteil),
    gtzBase: Number.parseFloat(row.gtz_base),
    gtzNorm: row.gtz_norm === null ? null : Number.parseFloat(row.gtz_norm),
    baselineNormKwh: row.baseline_norm_kwh === null ? null : Number.parseFloat(row.baseline_norm_kwh),
    messkonzeptTyp: row.messkonzept_typ,
    gueteR2: row.guete_r2 === null ? null : Number.parseFloat(row.guete_r2),
    gueteCvRmsePct: row.guete_cv_rmse_pct === null ? null : Number.parseFloat(row.guete_cv_rmse_pct),
    gueteNmbePct: row.guete_nmbe_pct === null ? null : Number.parseFloat(row.guete_nmbe_pct),
    guetePunkte: row.guete_punkte,
    baselineAbweichungPct:
      row.baseline_abweichung_pct === null ? null : Number.parseFloat(row.baseline_abweichung_pct),
    qualitaetsStufeMin: row.qualitaets_stufe_min,
  };
}

interface EinflussgroesseExportDbRow {
  readonly snapshot_id: string;
  readonly system_id: string;
  readonly groesse_code: string;
  readonly wert_num: string | null;
  readonly wert_code: string | null;
  readonly gueltig_ab_monat: unknown;
  readonly gueltig_bis_monat: unknown;
}

/** Roh-Zeile aus `analytics.eingang_einflussgroesse`, NOCH ohne `endkundeId` (die Tabelle selbst kennt keine — A5/D7-Projektion) — der Aufrufer (`NachweisExportService`) löst `snapshotId -> endkundeId` über die bereits geladenen `berechnungslaeufe` auf, s. dortiger Kommentar. */
export interface EinflussgroesseExportZeile {
  readonly snapshotId: string;
  readonly systemId: string;
  readonly groesseCode: string;
  readonly wertNum: number | null;
  readonly wertCode: string | null;
  readonly gueltigAbMonat: string;
  readonly gueltigBisMonat: string | null;
}

function mapEinflussgroesseRow(row: EinflussgroesseExportDbRow): EinflussgroesseExportZeile {
  return {
    snapshotId: row.snapshot_id,
    systemId: row.system_id,
    groesseCode: row.groesse_code,
    wertNum: row.wert_num === null ? null : Number.parseFloat(row.wert_num),
    wertCode: row.wert_code,
    gueltigAbMonat: toIsoDateString(row.gueltig_ab_monat),
    gueltigBisMonat: toIsoDateStringOrNull(row.gueltig_bis_monat),
  };
}

interface MesswertTagDbRow {
  readonly snapshot_id: string;
  readonly messkanal_key: number;
  readonly tag: unknown;
  readonly wert_kwh: string;
  readonly qualitaet_min: number;
  readonly anzahl_messwerte: number;
}

/**
 * Roh-Zeile aus `analytics.eingang_messwert_tag`, NOCH ohne `endkundeId`/
 * `energietraeger` (die Tabelle selbst kennt keine — Content-Addressing über
 * `snapshot_id`, identisches Muster zu `EinflussgroesseExportZeile`). Der
 * Aufrufer (`NachweisExportService`) löst `snapshotId -> (endkundeId,
 * energietraeger)` über die bereits geladenen `berechnungslaeufe` auf (jeder
 * `berechnungslauf` trägt GENAU EIN `messwert_snapshot_id`, `NOT NULL`).
 */
export interface MesswertTagExportZeile {
  readonly snapshotId: string;
  readonly messkanalKey: number;
  readonly tag: string;
  readonly wertKwh: number;
  readonly qualitaetMin: number;
  readonly anzahlMesswerte: number;
}

function mapMesswertTagRow(row: MesswertTagDbRow): MesswertTagExportZeile {
  return {
    snapshotId: row.snapshot_id,
    messkanalKey: row.messkanal_key,
    tag: toIsoDateString(row.tag),
    wertKwh: Number.parseFloat(row.wert_kwh),
    qualitaetMin: row.qualitaet_min,
    anzahlMesswerte: row.anzahl_messwerte,
  };
}

interface KlimaTagDbRow {
  readonly station_ref: string;
  readonly tag: unknown;
  readonly t_mittel: string;
  readonly gtz_tag: string;
}

function mapKlimaTagRow(row: KlimaTagDbRow): RenderKlimaTag {
  return {
    stationRef: row.station_ref,
    tag: toIsoDateString(row.tag),
    tMittel: Number.parseFloat(row.t_mittel),
    gtzTag: Number.parseFloat(row.gtz_tag),
  };
}

/** Eine Zeile von `findNachweisStammdaten()` (Exportschema v3, V0075). */
export interface NachweisStammdatenZeile {
  readonly endkundeId: string;
  readonly energietraeger: string;
  readonly endkundengruppe: string | null;
  readonly standortId: string | null;
  readonly baselineVersion: number;
  readonly bereinigungsverfahren: string;
  readonly messpunktAnzahl: number;
}

interface NachweisStammdatenDbRow {
  readonly endkunde_id: string;
  readonly energietraeger: string;
  readonly endkundengruppe: string | null;
  readonly standort_id: string | null;
  readonly baseline_version: number | null;
  readonly bereinigungsverfahren: string | null;
  readonly messpunkt_anzahl: string | number | null;
}

function mapNachweisStammdatenRow(row: NachweisStammdatenDbRow): NachweisStammdatenZeile {
  return {
    endkundeId: row.endkunde_id,
    energietraeger: row.energietraeger,
    endkundengruppe: row.endkundengruppe,
    standortId: row.standort_id,
    // Ohne gueltige Messkonzept-Version gibt es keine Baseline-Version. `1`
    // waere eine Behauptung; `0` ist erkennbar „keine".
    baselineVersion: row.baseline_version ?? 0,
    bereinigungsverfahren: row.bereinigungsverfahren ?? 'Gradtagzahlverfahren (VDI 3807)',
    messpunktAnzahl: Number(row.messpunkt_anzahl ?? 0),
  };
}


/**
 * ADR-0007 B5/B7 — REIN LESENDER Zugriff auf die ADR-0006-Lauf-Artefakte für
 * den Export-Renderer (`analytics.berechnungslauf`, `analytics.
 * eingang_klima_tag`, `analytics.klima_tag`, `analytics.
 * eingang_einflussgroesse`). Bewusst EIN EIGENES Repository (Muster
 * `AnalyticsLaufLookupRepository`, D2) — GENAU wie dort: eigene
 * Export-spezifische Queries, keine zusätzliche Kopplung an ein fremdes
 * Modul-Repository. `edms_app`/`edms_nachweis_renderer` haben `SELECT` auf
 * diese vier Tabellen (V0019-GRANTs bzw. Mitgliedschaft in
 * `edms_analytics_detail_reader`, V0025/B11) — kein neuer Grant nötig.
 *
 * **B7-Grenze, wörtlich eingehalten (NACHTRAG V0027/V0028):** KEINE Methode
 * dieser Klasse liest je aus `einfluss.*` oder `measurement.*` — die
 * `findEinflussgroessenBySnapshotIds()`-Methode liest AUSSCHLIESSLICH die
 * bereits pseudonyme PROJEKTION `analytics.eingang_einflussgroesse`
 * (dieselbe rote Linie wie beim Berechnungslauf-Schreibpfad,
 * `EinflussIntervallLeseRepository`-Kommentar). Analog liest
 * `findMesswertTageBySnapshotIds()` AUSSCHLIESSLICH die bereits eingefrorene
 * TAGES-Projektion `analytics.eingang_messwert_tag` (Kategorie `rohdaten`,
 * ADR-0007 A12) — NIE `measurement.*` selbst, NIE eine zweite Aggregation
 * (B7 wörtlich). Seit V0028 (`energy.messkonzept_version_energietraeger_
 * system`) ist die Anschlussnutzer-Sperr-Auflösbarkeit für diese Kategorie
 * kein strukturelles Dauer-Hindernis mehr (s. `PreflightService`/
 * `KETTE_NICHT_AUFLOESBAR_REGEL_CODE`, `verfahren.const.ts`) — der
 * Export-Renderer entscheidet je Export ANHAND des gebundenen Preflights,
 * ob die Kategorie gerendert wird (`FJ-10`-Check, s.
 * `nachweis-export-renderer.ts`).
 */
@Injectable()
export class AnalyticsExportLaufRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /** Volle Baseline-Zeile je (nicht-ersetztem) `berechnungslauf.id` — Aufrufer übergibt bereits die DISTINCT-Menge aus `nachweis.einsparlauf_bindung`. */
  async findBerechnungslaeufeByIds(berechnungslaufIds: readonly string[]): Promise<BerechnungslaufExportZeile[]> {
    if (berechnungslaufIds.length === 0) {
      return [];
    }
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT id, endkunde_id, energietraeger, periode_von, periode_bis, station_ref, messwert_snapshot_id, klima_snapshot_id,
              einflussgroesse_snapshot_id, verfahren_code, verfahren_version, parameter, parameter_hash, rohdaten_hash,
              baseline_wert_kwh, grundlast_anteil, gtz_base, gtz_norm, baseline_norm_kwh, qualitaets_stufe_min,
              messkonzept_typ, guete_r2, guete_cv_rmse_pct, guete_nmbe_pct, guete_punkte, baseline_abweichung_pct
         FROM analytics.berechnungslauf
        WHERE id = ANY($1::uuid[])`,
      [[...berechnungslaufIds]],
    );
    return mapManyRows(bindRows<BerechnungslaufDbRow>(rawRows), mapBerechnungslaufRow);
  }

  /**
   * ADR-0006 D7/A5, V0027/V0028 — die eingefrorene, pseudonyme Projektion
   * (GENAU die sechs Spalten von `analytics.eingang_einflussgroesse`, s.
   * `EinflussgroesseExportZeile`-Kommentar: KEIN `endkunde_id` in der
   * Quelltabelle). `snapshotIds` ist typischerweise die DISTINCT-Menge der
   * NICHT-NULL `einflussgroesseSnapshotId`-Werte aus
   * `findBerechnungslaeufeByIds()` — der Aufrufer (`NachweisExportService`)
   * löst `snapshotId -> endkundeId` über GENAU diese Läufe auf (jeder
   * Snapshot ist content-addressed je EINEM Endkunden zugeordnet,
   * `UNIQUE(endkunde_id, art, inhalt_hash)`, V0019).
   */
  async findEinflussgroessenBySnapshotIds(snapshotIds: readonly string[]): Promise<EinflussgroesseExportZeile[]> {
    if (snapshotIds.length === 0) {
      return [];
    }
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT snapshot_id, system_id, groesse_code, wert_num, wert_code, gueltig_ab_monat, gueltig_bis_monat
         FROM analytics.eingang_einflussgroesse
        WHERE snapshot_id = ANY($1::uuid[])`,
      [[...snapshotIds]],
    );
    return mapManyRows(bindRows<EinflussgroesseExportDbRow>(rawRows), mapEinflussgroesseRow);
  }

  /** ALLE gefrorenen Tageswerte der übergebenen Klima-Snapshots (dedupliziert NICHT — s. Renderer-Kopfkommentar „ehrlicher als blindes Deduplizieren"). */
  async findKlimaTageBySnapshotIds(klimaSnapshotIds: readonly string[]): Promise<RenderKlimaTag[]> {
    if (klimaSnapshotIds.length === 0) {
      return [];
    }
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT station_ref, tag, t_mittel, gtz_tag FROM analytics.eingang_klima_tag WHERE snapshot_id = ANY($1::uuid[])`,
      [[...klimaSnapshotIds]],
    );
    return mapManyRows(bindRows<KlimaTagDbRow>(rawRows), mapKlimaTagRow);
  }

  /**
   * Auflage A20 — bedingte Attribution: `true`, wenn MINDESTENS EIN
   * gefrorener Tageswert der übergebenen Snapshots gegen `analytics.
   * klima_tag` (laufender Vorrat, `quelle`-Spalte) auf eine Zeile trifft,
   * deren `quelle` NICHT mit `synthetic` beginnt.
   *
   * **Heuristik, dokumentiert (kein FK, best effort):** `analytics.
   * eingang_klima_tag` friert `(station_ref, tag, t_mittel, gtz_tag)` ein,
   * OHNE `quelle`/`revision` mit einzufrieren (V0019-Schema) — es gibt daher
   * KEINE direkte, referenzielle Verknüpfung zur Herkunft. Der Join matcht
   * über `(station_ref, tag, t_mittel)` gegen den LAUFENDEN Vorrat — trifft
   * eine spätere DWD-Revision exakt denselben `t_mittel`-Wert wie zuvor,
   * bliebe die Quelle unauffindbar (False Negative — die SICHERE Richtung:
   * lieber die Attribution fälschlich auslassen als sie fälschlich
   * behaupten, A20 wörtlich: „bei synthetischem Klima wäre der Vermerk eine
   * Falschangabe").
   *
   * Seit 2026-09-09 ist der Fall nicht mehr hypothetisch: mit
   * `EDMS_KLIMA_QUELLE=dwd` schreibt `AnalyticsKlimaTagRepository.insertAbruf()`
   * `quelle='dwd_cdc_kl_tag'`, und diese Methode liefert dann `true`. Der
   * Export würde damit `DWD_QUELLENVERMERK` ausgeben — solange dort der
   * PLATZHALTER steht, also einen unbrauchbaren Vermerk. Dass das nicht
   * passieren kann, hängt an genau einem Riegel: `FJ-08` blockt den
   * Förderjahr-Preflight, solange der Platzhalter-Marker im Text steht, und
   * ohne grünen Preflight entsteht kein Einsparlauf und kein Export. Wer den
   * wörtlichen Vermerk einsetzt (Auflage A-1, s. `docs/datenquellen.md`),
   * löst damit BEIDE Seiten gleichzeitig — deshalb gehört das zusammen
   * entschieden und nicht in zwei Schritten.
   */
  async hatNichtSynthetischeKlimaquelle(klimaSnapshotIds: readonly string[]): Promise<boolean> {
    if (klimaSnapshotIds.length === 0) {
      return false;
    }
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT 1 AS x
         FROM analytics.eingang_klima_tag ekt
         JOIN analytics.klima_tag kt
           ON kt.station_ref = ekt.station_ref AND kt.tag = ekt.tag AND kt.t_mittel = ekt.t_mittel
        WHERE ekt.snapshot_id = ANY($1::uuid[]) AND kt.quelle NOT LIKE 'synthetic%'
        LIMIT 1`,
      [[...klimaSnapshotIds]],
    );
    return bindRows<{ readonly x: number }>(rawRows).length > 0;
  }

  /**
   * ADR-0007 A12 (Kategorie `rohdaten`) — GENAU die eingefrorene Tages-
   * Projektion `analytics.eingang_messwert_tag` der übergebenen
   * `messwert_snapshot_id`-Menge, KEINE erneute Aggregation (B7). Aufrufer
   * übergibt bereits die DISTINCT-Menge aus `findBerechnungslaeufeByIds()`
   * (analog `findKlimaTageBySnapshotIds()`), NUR wenn die Kategorie für
   * diesen Export überhaupt gerendert wird (`PreflightService`s
   * `KETTE_NICHT_AUFLOESBAR_REGEL_CODE`/`FJ-10` NICHT im gebundenen
   * Preflight — s. `NachweisExportService.sammleRenderEingang()`): eine
   * Query, deren Ergebnis nie gerendert wird, wäre totes, ungetestetes
   * Risiko-Gepäck (identisches Prinzip zum vormaligen A12-Befund dieser
   * Klasse).
   */
  async findMesswertTageBySnapshotIds(snapshotIds: readonly string[]): Promise<MesswertTagExportZeile[]> {
    if (snapshotIds.length === 0) {
      return [];
    }
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT snapshot_id, messkanal_key, tag, wert_kwh, qualitaet_min, anzahl_messwerte
         FROM analytics.eingang_messwert_tag
        WHERE snapshot_id = ANY($1::uuid[])`,
      [[...snapshotIds]],
    );
    return mapManyRows(bindRows<MesswertTagDbRow>(rawRows), mapMesswertTagRow);
  }

  /**
   * Exportschema v3 (V0075) — die Stammdaten je (Endkunde, Energietraeger)
   * fuer die Einsparungsnachweis-Mappe.
   *
   * **Nur `energy.*`, kein Sprung nach `identity`.** Die Standort-BEZEICHNUNG
   * bleibt bewusst draussen: Sie liegt feldverschluesselt in
   * `identity.standort_pii` und haette in einem pseudonymisierten Nachweis
   * nichts zu suchen. Zurueck kommt die Kennung; der Renderer nummeriert
   * daraus „Standort 1", „Standort 2" — die Darstellung, die die Vorlage
   * selbst verwendet.
   *
   * Der Standort wird ueber `energy.system.standort_id` gelesen und NICHT
   * ueber die Zaehler-Verortung: Die ist feiner und temporal, und bei
   * mehreren Zaehlern haette sie mehrere Antworten (V0074-Kommentar).
   * Mehrere Systeme eines Messkonzepts mit verschiedenen Standorten liefern
   * den KLEINSTEN — nachvollziehbar und stabil; die Aufloesung je System
   * braeuchte die Granularitaets-Umstellung der Nachweis-Kette.
   */
  async findNachweisStammdaten(
    paare: readonly { readonly endkundeId: string; readonly energietraeger: string }[],
  ): Promise<NachweisStammdatenZeile[]> {
    if (paare.length === 0) {
      return [];
    }
    const rawRows: unknown = await this.txHost.tx.query(
      `WITH paar AS (
         SELECT * FROM unnest($1::uuid[], $2::text[]) AS t(endkunde_id, energietraeger)
       )
       SELECT p.endkunde_id,
              p.energietraeger,
              e.endkundengruppe,
              mv.version_nr                                   AS baseline_version,
              mv.bereinigungsverfahren,
              (SELECT min(s.standort_id::text)
                 FROM energy.messkonzept_version_energietraeger mvet2
                 JOIN energy.messkonzept_version_energietraeger_system mvs ON mvs.mvet_id = mvet2.id
                 JOIN energy.system s ON s.id = mvs.system_id
                WHERE mvet2.messkonzept_version_id = mv.id
                  AND mvet2.energietraeger = p.energietraeger
                  AND s.standort_id IS NOT NULL)              AS standort_id,
              (SELECT count(*)
                 FROM energy.messkonzept_version_energietraeger mvet3
                 JOIN energy.messkonzept_version_energietraeger_system mvs3 ON mvs3.mvet_id = mvet3.id
                 JOIN energy.zaehler z ON z.system_id = mvs3.system_id
                 JOIN energy.messkanal mk ON mk.zaehler_id = z.id
                WHERE mvet3.messkonzept_version_id = mv.id
                  AND mvet3.energietraeger = p.energietraeger
                  AND mk.status = 'aktiv')                    AS messpunkt_anzahl
         FROM paar p
         JOIN energy.endkunde e ON e.id = p.endkunde_id
         LEFT JOIN energy.messkonzept mk0 ON mk0.endkunde_id = p.endkunde_id
         LEFT JOIN energy.messkonzept_version mv
                ON mv.messkonzept_id = mk0.id AND mv.gueltig_bis IS NULL`,
      [paare.map((x) => x.endkundeId), paare.map((x) => x.energietraeger)],
    );
    return mapManyRows(bindRows<NachweisStammdatenDbRow>(rawRows), mapNachweisStammdatenRow);
  }

  /**
   * Exportschema v3 — die Energierichtung je Messkanal (V0074).
   *
   * Getrennte Abfrage statt eines Joins in `findMesswertTageBySnapshotIds()`:
   * Jene liefert die EINGEFRORENE Tagesprojektion und darf keine
   * Stammdaten-Spalte mitschleppen (B7/A5 — die Projektion ist genau
   * definiert). Die Richtung ist ein Stammdatum und wird deshalb hier
   * gelesen.
   */
  async findMesskanalRichtungen(
    messkanalKeys: readonly number[],
  ): Promise<{ readonly messkanalKey: number; readonly richtung: string }[]> {
    if (messkanalKeys.length === 0) {
      return [];
    }
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT kanal_key, richtung FROM energy.messkanal WHERE kanal_key = ANY($1::bigint[])`,
      [[...messkanalKeys]],
    );
    return (rawRows as { kanal_key: string | number; richtung: string }[]).map((r) => ({
      messkanalKey: Number(r.kanal_key),
      richtung: r.richtung,
    }));
  }
}
