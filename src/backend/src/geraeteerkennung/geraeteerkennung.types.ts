/**
 * Erhebungsmethoden aus [Q3] Kap. 5, wörtlich: „ob es sich um eine
 * Direktmessung, eine Algorithmen-Erkennung, ein Vorschaltgerät oder eine
 * sonstige Erhebungsmethode handelt".
 */
export const ERKENNUNGSMETHODEN = ['direktmessung', 'algorithmus', 'vorschaltgeraet', 'sonstige'] as const;
export type Erkennungsmethode = (typeof ERKENNUNGSMETHODEN)[number];

/** Eine Geräte-/Anlagengruppe eines Endkunden. */
export interface GeraetegruppeItem {
  readonly id: string;
  readonly endkundeId: string;
  readonly bezeichnung: string;
  readonly beschreibung: string | null;
}

/** Die Zuordnung eines Messkanals zu einer Gruppe — mit allem, was Kap. 5 verlangt. */
export interface ZuordnungItem {
  readonly geraetegruppeId: string;
  readonly geraetegruppeBezeichnung: string;
  readonly messkanalId: string;
  readonly methode: Erkennungsmethode;
  /** Erwartete Genauigkeit in Prozent. `null` nur bei Direktmessung. */
  readonly genauigkeitPct: number | null;
  /** Anteil des Kanalverbrauchs, der dieser Gruppe zuzurechnen ist. */
  readonly anteilProzent: number;
  /**
   * `true` = Untermessung; der Verbrauch steckt bereits in der Hauptmessung.
   *
   * ABGELEITET aus `energy.messkanal.ist_untermessung` (V0058), nicht an der
   * Zuordnung gespeichert — die Topologie ist eine Eigenschaft der Messstelle.
   */
  readonly imGesamtverbrauchEnthalten: boolean;
  readonly gueltigVon: string;
  readonly gueltigBis: string | null;
  readonly beendetGrund: string | null;
  readonly wirksam: boolean;
}

/**
 * Die Entbehrlichkeits-Feststellung EINES Systems ([Q3] Kap. 5).
 *
 * Eigene Lese-Auskunft statt eines Feldes an `SystemDetail`: Die Feststellung
 * gehoert fachlich zur Geraeteerkennung, nicht zu den Stammdaten des Systems —
 * und ein Stammdaten-DTO um ein Auflagen-Feld zu erweitern, haette die Grenze
 * zwischen den Modulen an der falschen Stelle aufgeweicht.
 */
export interface EntbehrlichkeitItem {
  readonly systemId: string;
  readonly entbehrlich: boolean;
  /** Pflicht-Begruendung, `null` solange nichts vermerkt ist. */
  readonly grund: string | null;
}

/** Der zugeordnete Verbrauch EINER Gruppe im Zeitraum. */
export interface GruppenAnteil {
  readonly geraetegruppeId: string;
  readonly bezeichnung: string;
  readonly zugeordnetKwh: number;
  /** Anteil am Gesamtverbrauch in Prozent. */
  readonly anteilPct: number;
}

/**
 * Die Zuordnungsquote nach [Q3] Kap. 5.
 *
 * **Die Quote ist eine Rechnung, keine Wertung.** Sie sagt, welcher Anteil
 * des Gesamtverbrauchs Gruppen zugeordnet ist — nicht, ob die Auflage damit
 * erfüllt ist. Die Entbehrlichkeits-Feststellung nach Kap. 5 („Systeme, die
 * nur ein Gerät umfassen") steht deshalb DANEBEN und verändert die Zahl
 * nicht: Eine Quote, die sich durch ein Häkchen von 12 % auf „erfüllt" hebt,
 * wäre genau die Zahl, der niemand mehr trauen kann.
 */
export interface ZuordnungsQuote {
  readonly foerderjahrCode: string;
  /** Projektjahr-Nummer — bestimmt die Sollquote. */
  readonly foerderjahrNummer: number;
  readonly vonMonat: string;
  readonly bisMonat: string;
  readonly endkundeId: string;
  readonly energietraeger: string;

  readonly gesamtKwh: number;
  readonly zugeordnetKwh: number;
  /** `null`, wenn im Zeitraum kein Verbrauch vorliegt — 0 % wäre dann eine Behauptung. */
  readonly quotePct: number | null;
  /** 20 / 25 / 30 / 35 / 40 nach Projektjahr ([Q3] Kap. 5, nicht kumulativ). */
  readonly sollQuotePct: number;
  /** `null`, solange die Quote nicht bestimmbar ist. */
  readonly erreicht: boolean | null;

  readonly gruppen: readonly GruppenAnteil[];

  /** Systeme des Endkunden insgesamt und davon als entbehrlich vermerkt. */
  readonly systemeGesamt: number;
  readonly systemeEntbehrlich: number;
  /**
   * `true`, wenn ALLE Systeme als entbehrlich vermerkt sind — dann gelten die
   * Anforderungen nach Kap. 5 pauschal als erfüllt. Die Würdigung trifft
   * trotzdem ein Mensch; dieses Feld nimmt sie ihm nicht ab, es zeigt ihm nur
   * die Tatsache.
   */
  readonly alleSystemeEntbehrlich: boolean;
  /**
   * `true`, wenn für den Zeitraum keine Tageswerte vorliegen. Dann ist die
   * Quote nicht „0 %", sondern unbekannt — und der Grund ist meist, dass die
   * Verdichtung für den Zeitraum noch nicht gelaufen ist.
   */
  readonly ohneTageswerte: boolean;
}
