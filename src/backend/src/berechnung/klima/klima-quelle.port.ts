/** EIN Tageswert (lokaler Kalendertag, `tages_zeitzone` des Laufs — B5 D4). */
export interface KlimaTagWert {
  /** ISO `YYYY-MM-DD`, lokaler Kalendertag (KEIN Zeitstempel). */
  readonly tag: string;
  readonly tMittelC: number;
}

/**
 * EIN Tageswert MIT quellenseitigem Qualitätsniveau — der Schreibpfad
 * (Adapter → `analytics.klima_tag`). Der Lesepfad der Rechnung braucht das
 * Niveau nicht und bleibt bei `KlimaTagWert`.
 */
export interface KlimaTagRohwert extends KlimaTagWert {
  /**
   * DWD-Spalte `QN_4` (1..10) bzw. `null`, wenn die Quelle kein
   * Qualitätsniveau kennt (synthetisch). Trägt die Unterscheidung
   * „vorläufig" (`recent/`) vs. „geprüft" (`historical/`) und ist damit der
   * fachliche Grund für die `revision`-Achse (V0019 D4/R2: „DWD revidiert
   * Werte nachträglich").
   */
  readonly qualitaetsNiveau: number | null;
}

/**
 * Woher ein Abruf stammt — Auflage A-3 (`docs/datenquellen.md` DQ-001:
 * „je Abruf zu persistieren: Stations-ID, Zeitraum, Abrufzeitpunkt,
 * Dateiversion, Lizenzkennung"). Stations-ID, Zeitraum und Abrufzeitpunkt
 * kennt der Aufrufer bereits; Dateiversion und Lizenzkennung kann NUR der
 * Adapter beisteuern — deshalb stehen sie im Vertrag.
 */
export interface KlimaHerkunft {
  /**
   * Kennung des Adapters, wandert 1:1 nach `analytics.klima_tag.quelle`:
   * `'synthetic_dev'` oder `'dwd_cdc_kl_tag'` (s. Spaltenkommentar V0063).
   */
  readonly quelle: string;
  /**
   * Datei(en), aus denen die Werte stammen — bei DWD der Archivname samt
   * Zeitraum. `null`, wenn es keine Quelldatei gibt (synthetisch).
   */
  readonly dateiVersion: string | null;
  /**
   * Lizenzkennung der Fremddatenquelle (`'CC-BY-4.0'`). `null` für
   * synthetische Werte — eine Lizenzangabe wäre dort sachlich falsch
   * (s. `SyntheticKlimaQuelleAdapter`-Doc).
   */
  readonly lizenzId: string | null;
}

/** Ergebnis eines Abrufs: die Werte samt ihrer Herkunft. */
export interface KlimaAbruf {
  readonly werte: readonly KlimaTagRohwert[];
  readonly herkunft: KlimaHerkunft;
}

/**
 * ADR-0006 D4 — Port/Adapter, quellen-agnostisch (B5: "Klimadaten: Port/
 * Adapter ... Lizenz offen (O-B1)", inzwischen GESCHLOSSEN, s.
 * `DWD_QUELLENVERMERK`). Liefert Tagesmitteltemperaturen einer Station über
 * einen Zeitraum — welcher Adapter antwortet, ist für den Aufrufer
 * (`BerechnungslaufService`) irrelevant, er kennt nur diesen Vertrag.
 *
 * Zwei Adapter sind gebunden, die Wahl trifft `KlimaQuelleConfigService`
 * (`EDMS_KLIMA_QUELLE`, Default `synthetic`):
 *
 *   - `SyntheticKlimaQuelleAdapter` — deterministisches Jahresprofil für
 *     Dev/Test/CI. Kein Netzzugriff, keine Fremddaten, keine Attribution.
 *   - `DwdKlimaQuelleAdapter` — realer Abruf von `opendata.dwd.de` (CDC,
 *     Tageswerte KL). **Bulk-Download öffentlicher Dateien**, KEINE
 *     parametrisierte API und KEINE Übermittlung von Endkunden-, Standort-
 *     oder Zähler-Identifikatoren: die einzige ausgehende Angabe ist die
 *     öffentliche DWD-Stationsnummer (Auflage A-4, `docs/datenquellen.md`
 *     DQ-001).
 *
 * Der Rückgabewert trägt die Herkunft mit (`KlimaHerkunft`), weil der
 * Aufrufer sie sonst raten müsste — und ein geratener Lizenzvermerk im
 * BAFA-Export ist schlimmer als gar keiner.
 */
export interface KlimaQuellePort {
  /**
   * @param stationRef Eingefrorene Stationsreferenz (D4 fail-closed-Regel:
   *   keine Laufzeit-Auflösung über `energy.standort.klimareferenz` — die
   *   Grobkörnigkeits-/Mehrdeutigkeits-Frage ist laut ADR-0006 O-B5 noch
   *   NICHT final entschieden. `stationRef` kommt daher als EXPLIZITES,
   *   vom Aufrufer übergebenes Feld in den Lauf, s. `BerechnungslaufService`).
   *   Der DWD-Adapter erwartet darin eine DWD-Stationsnummer (s.
   *   `toDwdStationsId`); der synthetische Adapter ignoriert das Feld.
   * @param von ISO `YYYY-MM-DD`, inklusive.
   * @param bis ISO `YYYY-MM-DD`, EXKLUSIV (halboffenes Intervall, api-contracts.md-Konvention).
   */
  readonly holeTageswerte: (stationRef: string, von: string, bis: string) => Promise<KlimaAbruf>;
}

export const KLIMA_QUELLE_PORT = Symbol('KLIMA_QUELLE_PORT');
