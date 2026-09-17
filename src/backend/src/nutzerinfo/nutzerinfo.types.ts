/** Qualitätsstufe eines Monats — 1:1 aus `analytics.laufergebnis` (ADR-0006 B12.4). */
export const QUALITAETS_STUFEN = ['belastbar', 'eingeschraenkt', 'nicht_ausweisbar'] as const;
export type QualitaetsStufe = (typeof QUALITAETS_STUFEN)[number];

/**
 * Wege, auf denen eine Nutzerinformation den Endkunden erreicht (TB-06
 * Versand-/Bereitstellungsnachweis).
 *
 * **Heute existiert keiner von ihnen.** Weder ein Nutzerportal noch ein
 * Versandweg ist gebaut; die Liste beschreibt, was vorgesehen ist, nicht was
 * geht. Sie steht hier trotzdem, weil ein Nachweis ohne Angabe des Weges
 * keine Aussage ist: „informiert" ist etwas anderes als „bereitgestellt".
 */
export const ZUSTELLWEGE = ['portal_bereitgestellt', 'email', 'brief', 'persoenlich'] as const;
export type Zustellweg = (typeof ZUSTELLWEGE)[number];

/**
 * Die monatliche Nutzerinformation, wie die API sie ausgibt.
 *
 * PII-frei im Sinne von Klartext: Kennungen, Codes, Zeitpunkte und
 * Verbrauchszahlen. Die Zahlen sind über `endkundeId` pseudonym
 * personenbeziehbar — dieselbe Einstufung wie bei `measurement.messwert`.
 */
export interface NutzerinformationItem {
  readonly id: string;
  readonly endkundeId: string;
  readonly energietraeger: string;
  /** Monatserster, ISO `YYYY-MM-DD`. */
  readonly monat: string;
  /** Welcher Berechnungslauf die Zahlen geliefert hat — die Herkunft der Aussage. */
  readonly berechnungslaufId: string;
  /** Was nach Baseline zu erwarten war (R_m). */
  readonly referenzKwh: number;
  /** Was tatsächlich verbraucht wurde (A_m). */
  readonly istKwh: number;
  /** `referenzKwh - istKwh`. **Positiv = Einsparung, negativ = Mehrverbrauch.** */
  readonly deltaKwh: number;
  readonly qualitaetsStufe: QualitaetsStufe;
  readonly abdeckungPct: number;
  readonly tageFehlend: number;
  readonly kandidatenAnzahl: number;
  /** SHA-256 des kanonisierten Inhalts, hex. */
  readonly inhaltHashHex: string;
  readonly erzeugtAt: string;
  readonly zugestelltAt: string | null;
  readonly zustellweg: Zustellweg | null;
}

/** Der Verbrauch EINER Gerätegruppe im Berichtsmonat ([Q3] Kap. 6). */
export interface BerichtGruppe {
  readonly geraetegruppeId: string;
  readonly bezeichnung: string;
  readonly verbrauchKwh: number;
  /** Anteil am erfassten Gesamtverbrauch des Monats, in Prozent. */
  readonly anteilPct: number;
}

/**
 * Der Bericht, den ein Endkunde zu sehen bekommt (TB-06, [Q3] Kap. 6).
 *
 * **Er rechnet nichts neu.** Verbrauch, Erwartung und Differenz stammen
 * unverändert aus der eingefrorenen `nutzerinfo.information` — dieselbe Zahl,
 * die auch die Bewilligungsbehörde sieht. Der Bericht fügt nur hinzu, was
 * Kap. 6 darüber hinaus verlangt und was sich aus dem Bestand ergibt:
 *
 * - die **Aufteilung nach Geräte- und Anlagengruppen** („die Verbräuche der
 *   erkannten Gruppen, getrennt nach jeweiligen Gruppen"). Sie wird aus den
 *   Zuordnungen gebildet, die IM BERICHTSMONAT galten — nicht aus den heute
 *   geltenden. Eine Zuordnung kann nur zum heutigen Tag beendet, nie
 *   rückwirkend verschoben werden; der Monatsbericht bleibt damit
 *   reproduzierbar.
 * - den **Vergleich zum Vormonat**, damit die Zahl eine Richtung bekommt.
 *   Verglichen wird mit der Information, die der Kunde damals TATSÄCHLICH
 *   bekommen hat, nicht mit einer Neuberechnung.
 *
 * **Was der Bericht NICHT behauptet:** Ist keine Gerätegruppe zugeordnet,
 * bleibt die Liste leer und `nichtZugeordnetKwh` trägt den gesamten
 * Verbrauch. Eine erfundene Aufteilung wäre schlimmer als keine.
 */
export interface NutzerinfoBericht {
  readonly information: NutzerinformationItem;
  /** Erster und letzter Tag des Berichtsmonats, ISO `YYYY-MM-DD`. */
  readonly vonTag: string;
  readonly bisTag: string;
  readonly gruppen: readonly BerichtGruppe[];
  /** Summe der Gruppen-Verbräuche. */
  readonly zugeordnetKwh: number;
  /** Erfasster Verbrauch, der KEINER Gruppe zugeordnet ist. */
  readonly nichtZugeordnetKwh: number;
  /**
   * `true`, wenn für den Monat keine Tageswerte vorliegen. Dann ist die
   * Aufteilung nicht „0 %", sondern unbekannt — und der Bericht sagt das,
   * statt eine leere Torte zu zeigen.
   */
  readonly ohneTageswerte: boolean;
  /** Die Differenz des Vormonats, `null` wenn es keine gab. */
  readonly vormonatDeltaKwh: number | null;
  /** Der Verbrauch des Vormonats, `null` wenn es keinen gab. */
  readonly vormonatIstKwh: number | null;
}

/**
 * Was ein Erzeugungslauf getan hat — und vor allem, was er NICHT getan hat.
 *
 * Die drei Übersprungen-Zahlen sind der eigentliche Wert dieses Objekts. Ein
 * Lauf, der 40 von 100 Kunden informiert, ist kein Erfolg und kein
 * Misserfolg, solange man nicht weiß, warum die übrigen 60 fehlen:
 *
 *   * `uebersprungenWiderspruch` — der Kunde will es nicht. Zulässig, sogar
 *     gefordert (TB-06 Opt-out).
 *   * `uebersprungenGesperrt` — die Verarbeitung ist nach Art. 18
 *     eingeschränkt. Zulässig.
 *   * `ohneBerechnung` — **ein Befund.** Für diesen Kunden gibt es keinen
 *     eindeutig bindbaren Berechnungslauf; er kann nicht informiert werden,
 *     obwohl er informiert werden müsste. Das ist die Zahl, die eine
 *     Auflagenverletzung sichtbar macht.
 */
export interface NutzerinfoLaufErgebnis {
  readonly modus: 'probelauf' | 'ausfuehrung';
  readonly monat: string;
  readonly anzahlPaare: number;
  readonly anzahlErzeugt: number;
  readonly uebersprungenWiderspruch: number;
  readonly uebersprungenGesperrt: number;
  /** Kein Kandidat ODER widersprüchliche Kandidaten — beides heißt: nicht informierbar. */
  readonly ohneBerechnung: number;
}

/**
 * Der Stand eines Monats — die Frage des Betriebs: **Ist der Monat durch?**
 *
 * Bewusst OHNE die Zahl der Endkunden ohne Berechnungsgrundlage. Die kennt
 * nur ein Lauf, weil sie sich aus dem Vergleich mit den vorhandenen
 * Berechnungslaeufen ergibt — sie hier zu schaetzen hiesse, eine zweite,
 * moeglicherweise abweichende Wahrheit zu erzeugen.
 */
export interface NutzerinfoMonatsstand {
  /** Der ausgewertete Monat, Monatserster. Bei fehlender Angabe der letzte ABGESCHLOSSENE. */
  readonly monat: string;
  readonly anzahlErzeugt: number;
  readonly anzahlZugestellt: number;
  /** Erzeugt, aber nicht zugestellt — fuer diese Monate ist die Auflage offen. */
  readonly anzahlOffen: number;
}

/**
 * Was eine Sammelzustellung getan hat.
 *
 * `anzahlBereitsZugestellt` ist kein Fehlerzaehler: Wer eine einzelne
 * Information vorab zugestellt hat, soll den Stapel trotzdem abschliessen
 * koennen. Die Zahl macht nur sichtbar, dass der Stapel nicht die ganze
 * Menge betraf.
 */
export interface NutzerinfoSammelZustellung {
  readonly monat: string;
  readonly zustellweg: Zustellweg;
  readonly zugestelltAt: string;
  readonly anzahlGesamt: number;
  readonly anzahlVermerkt: number;
  readonly anzahlBereitsZugestellt: number;
}
