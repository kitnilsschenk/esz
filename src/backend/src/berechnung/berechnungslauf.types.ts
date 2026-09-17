import type { Energietraeger } from '../stammdaten/persistence/energy/energy-zaehler.repository';
import type { Ausloeser, QualitaetsStufe } from './persistence/analytics-berechnungslauf.repository';
import type { MesskonzeptTyp } from './persistence/mvet-lookup.repository';

export interface LaufergebnisAntwort {
  readonly monat: string;
  readonly referenzKwh: number;
  readonly istKwh: number;
  readonly gtzIst: number;
  readonly tageGesamt: number;
  readonly tageGemessen: number;
  readonly tageGeschaetzt: number;
  readonly tageErsatz: number;
  readonly tageFehlend: number;
  readonly abdeckungPct: number;
  readonly qualitaetsStufe: QualitaetsStufe;
}

/**
 * `GET /berechnung/laeufe/{laufId}` — Lauf + `laufergebnis`, PII-frei
 * (`endkundeId` ist Pseudonym, KEINE Klartext-Stammdaten). AUSDRÜCKLICH
 * OHNE Tages-Detail-Snapshots (`eingang_messwert_tag`/`eingang_klima_tag`)
 * — die sind `read:verbrauch_detail`/`edms_analytics_detail_reader`-Niveau,
 * kein v1-Konsument dieser Route (Arbeitsauftrag Priorität 4, wörtlich).
 */
/**
 * Güte der Baseline-Anpassung (V0076). Vier Maße statt einem: R² allein ist
 * bei wärmegeführten Trägern schon durch den Sommer-Winter-Kontrast hoch,
 * auch wenn das Modell in den Übergangsmonaten danebenliegt.
 */
export interface ModellgueteAntwort {
  /** R², zentriert definiert. Darf negativ sein. */
  readonly bestimmtheitsmass: number;
  readonly cvRmsePct: number;
  readonly nmbePct: number;
  /** n — Monatspunkte der Vermessung. Ohne n ist R² nicht bewertbar. */
  readonly punkte: number;
  /** Abstand der angepassten zur nach TB-02 erfassten Jahres-Baseline, in Prozent. */
  readonly baselineAbweichungPct: number | null;
}

export interface BerechnungslaufAntwort {
  readonly id: string;
  readonly endkundeId: string;
  readonly energietraeger: Energietraeger;
  readonly mvetId: string;
  readonly verfahrenCode: string;
  readonly verfahrenVersion: number;
  readonly periodeVon: string;
  readonly periodeBis: string;
  readonly baselineWertKwh: number;
  readonly grundlastAnteil: number;
  readonly gtzBase: number;
  readonly gtzNorm: number | null;
  readonly baselineNormKwh: number | null;
  /** V0076 — Messkonzept, mit dem DIESER Lauf gerechnet hat. */
  readonly messkonzeptTyp: MesskonzeptTyp;
  /** V0076 — `null` beim vereinfachten Verfahren: es wurde nichts angepasst. */
  readonly modellguete: ModellgueteAntwort | null;
  readonly qualitaetsStufeMin: QualitaetsStufe;
  readonly ausloeser: Ausloeser;
  readonly ersetztLaufId: string | null;
  /**
   * Der Lauf, der DIESEN ersetzt — `null`, solange keiner existiert.
   *
   * Gegenrichtung zu `ersetztLaufId`. Ohne sie liest jemand eine alte Zahl,
   * ohne zu erkennen, dass sie durch eine Korrektur ueberholt ist.
   */
  readonly ersetztDurchLaufId: string | null;
  readonly erstelltAt: string;
  readonly ergebnisse: readonly LaufergebnisAntwort[];
}

/**
 * `GET /berechnung/endkunden/{endkundeId}/laeufe` — PII-freie Zusammenfassung
 * je Lauf (OHNE `laufergebnis`-Monatszeilen, OHNE Snapshot-/Rohdaten-Hashes).
 * Für die Betriebs-UI-Liste; Detail + Monatswerte über die `{laufId}`-Route.
 */
export interface BerechnungslaufListItem {
  readonly id: string;
  readonly energietraeger: Energietraeger;
  readonly verfahrenCode: string;
  readonly verfahrenVersion: number;
  readonly periodeVon: string;
  readonly periodeBis: string;
  readonly qualitaetsStufeMin: QualitaetsStufe;
  readonly ausloeser: Ausloeser;
  readonly ersetztLaufId: string | null;
  readonly erstelltAt: string;
}

/**
 * Woher die Zähler-Menge eines Laufs stammt — steht als
 * `systemgrenze_quelle` im Audit-Kontext des abgeschlossenen Laufs.
 *
 * `mvet_system`: über die V0028-Zuordnung `mvet -> System` aufgelöst (Regel).
 * `endkunde_fallback`: für diese `mvet` ist KEINE Zuordnung gepflegt, der
 * Lauf hat auf "alle Zähler des Endkunden mit passendem Energieträger"
 * zurückgegriffen. Fachlich unschärfer — bei mehreren Messkonzepten desselben
 * Kunden fließt fremder Verbrauch ein. Deshalb ausgewiesen und nicht still.
 */
export type SystemgrenzeQuelle = 'mvet_system' | 'endkunde_fallback';
