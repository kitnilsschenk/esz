/** `GET /messwerte/standorte/{standortId}/verbrauch` — Zeitauflösung (Backend-Lead-Arbeitsauftrag, wörtlich). */
export const AUFLOESUNG_WERTE = ['stunde', 'tag', 'monat'] as const;
export type Aufloesung = (typeof AUFLOESUNG_WERTE)[number];

/**
 * EIN Punkt der aggregierten Verbrauchs-Zeitreihe. `messgroesse`+`einheit`
 * bilden GEMEINSAM die Serien-Gruppe (Design-Entscheidung, s.
 * `verbrauch-aggregat.service.ts`-Klassen-Dok): "gemischte Einheiten werden
 * nicht stumm addiert" ist NUR hinreichend abgesichert, wenn zusätzlich zur
 * Einheit auch die Messgröße auseinandergehalten wird (zwei Kanäle können
 * zufällig dieselbe Einheit `kWh` tragen — Wirkarbeit vs. Wärmemenge — ohne
 * fachlich vergleichbar zu sein). `wert` ist NIEMALS `null`/0 für eine
 * erkannte Lücke — ein Bucket ohne belastbaren Wert erscheint hier gar NICHT
 * (s. `metadaten.erkannteLuecken`).
 */
export interface VerbrauchAggregatPunkt {
  readonly zeitpunkt: string;
  readonly messgroesse: string;
  readonly einheit: string;
  readonly wert: number;
}

export interface VerbrauchAggregatMetadaten {
  /** Anzahl der zum Stichtag unter dem Knoten verorteten Zähler (`energy.zaehler_standort`, D3/D6). */
  readonly einbezogeneZaehler: number;
  /**
   * Anzahl der AKTIVEN Hauptmessungen dieser Zähler (unabhängig davon, ob sie
   * im Fenster tatsächlich Werte lieferten). Untermessungen sind NICHT
   * enthalten — s. `ausgelasseneUntermessungen`.
   */
  readonly einbezogeneKanaele: number;
  /**
   * Anzahl der aktiven Kanäle, die als Untermessung gekennzeichnet sind
   * (V0058) und deshalb nicht in die Kurve eingehen: Sie messen eine
   * Teilmenge einer Hauptmessung, doppelt gezählt ergäbe das einen zu hohen
   * Verbrauch. Ausgewiesen, damit die Differenz zur Kanalzahl der Stammdaten
   * erklärbar ist.
   */
  readonly ausgelasseneUntermessungen: number;
  /**
   * Anzahl der (Zeit-Bucket × Messgrößen/Einheiten-Gruppe)-Kombinationen OHNE
   * belastbaren Wert — weder 0 noch stillschweigend übersprungen (Fachlicher
   * Kern des Arbeitsauftrags: "Lücken nicht als 0 ausgeben").
   */
  readonly erkannteLuecken: number;
}

export interface VerbrauchAggregatAntwort {
  readonly zeitreihe: readonly VerbrauchAggregatPunkt[];
  readonly metadaten: VerbrauchAggregatMetadaten;
}
