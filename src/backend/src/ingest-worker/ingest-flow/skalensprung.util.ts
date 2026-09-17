/**
 * ADR-0011 O3 Punkt 3 — Skalensprung-Erkennung auf der Differenzreihe.
 *
 * DER FALL, DEN KEIN STRUKTURHASH FAENGT
 * -------------------------------------
 * Punkt 2 der O3-Entscheidung sichert die STRUKTUR des fremden Codecs:
 * Kommen Felder hinzu, fallen weg oder aendern ihren Typ, aendert sich der
 * Hash. Eine reine FAKTORAENDERUNG laesst all das unveraendert — ein
 * Wandlerverhaeltnis 1:100 wird auf 1:200 gestellt, `sum_in123_kWh` heisst
 * weiter so, ist weiter eine Zahl, hat weiter dieselbe Einheit. Nur der Wert
 * ist ab jetzt doppelt so gross. Dagegen hilft kein Hash, sondern nur ein
 * Test auf der Zahlenreihe selbst.
 *
 * WARUM DIE MONOTONIE DAS NICHT SCHON ERLEDIGT
 * Ein Skalensprung nach OBEN laesst den Zaehlerstand STEIGEN — er ist damit
 * monoton plausibel und laeuft heute unbemerkt durch. Genau das ist die
 * Luecke. (Ein Sprung nach UNTEN faellt bereits in
 * `unplausibel_monotonie_verletzt`; s. Abschnitt "Nur aufwaerts" unten.)
 *
 * DIE PRUEFUNG IN EINEM SATZ
 * Verdacht besteht, wenn ein Zuwachs NICHT ALS VERBRAUCH ERKLAERBAR ist,
 * wohl aber ALS FAKTOR AUF DEN ZAEHLERSTAND.
 *
 * Das sind zwei getrennte Aussagen, und beide werden geprueft:
 *
 *   (2) Nicht als Verbrauch erklaerbar — der Zuwachs uebersteigt die
 *       robuste Erwartung der letzten Intervalle um ein Vielfaches.
 *   (3) Als Faktor erklaerbar — der ZAEHLERSTAND selbst waechst um einen
 *       Anteil, den ein Viertelstundenverbrauch nicht hergibt.
 *
 * Vorgeschaltet ist (1) ein Reifekriterium: Vor genuegend Betriebshistorie
 * ist die Unterscheidung "Anlage faehrt an" ./. "Faktor geaendert" aus der
 * Reihe allein nicht zu treffen — dort schweigt dieser Test bewusst (s.
 * `SKALENSPRUNG_REIFE_INTERVALLE`).
 *
 * WARUM DIE ERWARTUNG EIN MEDIAN IST UND KEIN MITTELWERT
 * Ein einzelner Ausreisser (Lastspitze, nachgetragener Backfill-Wert) zieht
 * einen Mittelwert mit und hebt die Schwelle genau dann an, wenn sie
 * gebraucht wird. Der Median ist gegen einzelne Ausreisser unempfindlich;
 * er verschiebt sich erst, wenn sich die halbe Reihe verschiebt — was nach
 * einem Faktorwechsel zwar eintritt, aber erst NACH dem Sprung, den wir
 * abfangen wollen.
 *
 * FAIL-CLOSED UND SELBSTHALTEND
 * Die erste auffaellige Zeile geht in die Quarantaene und wird NICHT
 * geschrieben. Damit bleibt der zuletzt geschriebene Wert der alte, und
 * jeder Folgewert wird wieder gegen ihn geprueft — die Sperre haelt sich
 * selbst, bis ein Mensch den Befund aufloest. Es braucht deshalb keinen
 * zusaetzlichen Persistenz-Test ueber mehrere Intervalle: Der waere nur
 * noetig, wenn die verdaechtigen Werte zwischenzeitlich geschrieben wuerden.
 *
 * NUR AUFWAERTS, UND WARUM
 * Ein Faktorwechsel nach unten (1:200 -> 1:100) HALBIERT den Zaehlerstand.
 * Das ist bereits ein Monotonie-Verstoss und wird fail-closed abgefangen —
 * nur eben unter dem unspezifischen Grund. Ihn hier als Skalensprung zu
 * deuten waere geraten: Ein Geraetetausch und ein Zaehleruerberlauf erzeugen
 * dieselbe Form (Stand faellt auf ~0 bzw. springt zurueck), und aus der Reihe
 * allein sind die drei Ursachen nicht zu trennen. Eine falsche Etikettierung
 * im Arbeitsvorrat ist schlechter als eine unspezifische.
 *
 * NUR KUMULATIVE KANAELE, UND WARUM
 * Bei `kumulativ_zaehlerstand` wirkt der Faktor auf den AUFGELAUFENEN Stand;
 * der Sprung ist deshalb um Groessenordnungen groesser als jeder
 * Intervallverbrauch, und (3) ist eine sehr scharfe Aussage. Bei
 * `intervall_verbrauch` fehlt diese Verstaerkung: Dort multipliziert der
 * Faktor nur den Einzelwert, und ein k von 1,25 ist von normaler
 * Lastschwankung an EINEM Wert nicht zu unterscheiden. Der dafuer noetige
 * Test ist ein anderer (Niveauverschiebung ueber ein Fenster, nicht
 * fail-closed auf dem Einzelwert) — s. ADR-0011 O3, offener Punkt.
 */

/**
 * Wie viele auswertbare Zuwaechse die Erwartung mindestens tragen muessen.
 *
 * Zwoelf Intervalle sind bei 15-Minuten-Werten drei Stunden. Weniger traegt
 * keinen Median: Bei vier Stuetzstellen entscheidet ein einziger Wert ueber
 * die Schwelle, und der Test wuerde zufaellig.
 */
export const SKALENSPRUNG_MIN_STUETZSTELLEN = 12;

/**
 * Ab welcher Betriebshistorie geprueft wird — ausgedrueckt als Verhaeltnis
 * von Zaehlerstand zu erwartetem Intervallzuwachs.
 *
 * 96 Intervalle sind bei 15-Minuten-Werten ein Tag. Darunter ist der Stand
 * noch so klein, dass ein Anfahren der Anlage denselben relativen Sprung
 * erzeugt wie ein Faktorwechsel — der Test koennte beide nicht trennen und
 * wuerde den Arbeitsvorrat mit Inbetriebnahme-Faellen fluten. Diese Luecke
 * ist bewusst und NICHT unbewacht: Ein frisch angebundenes Geraet erzeugt
 * ohnehin eine neue Zeile im Dekodierungs-Profil-Katalog (O3 Punkt 1/2) und
 * damit ein Pflicht-Audit-Ereignis.
 */
export const SKALENSPRUNG_REIFE_INTERVALLE = 96;

/**
 * Um welches Vielfache der Erwartung ein Zuwachs liegen muss, um nicht mehr
 * als Verbrauch erklaerbar zu sein.
 *
 * Der Tag-/Nacht-Hub eines Viertelstundenwerts liegt in Gebaeuden bei etwa
 * Faktor 10 gegen den Median, Lastspitzen erreichen ein Mehrfaches davon.
 * Zwanzig laesst dem echten Betrieb Luft und ist von einem Faktorwechsel weit
 * entfernt: Der erzeugt einen Zuwachs von `Stand x (k-1)`, also bei einem
 * Jahr Historie und k=1,05 bereits das Tausendfache der Erwartung.
 */
export const SKALENSPRUNG_AUSREISSER_FAKTOR = 20;

/**
 * Ab welchem Wachstum des ZAEHLERSTANDES in einem Intervall der Zuwachs als
 * Faktor erklaerbar ist.
 *
 * 1,05 heisst: Fuenf Prozent des gesamten aufgelaufenen Zaehlerstandes in
 * einer Viertelstunde. Bei einem gereiften Zaehler gibt das keine reale Last
 * her. Nach unten begrenzt wird der Wert durch die realen Wandlerspruenge:
 * Die engste Stufe benachbarter Normwandler (750/800 A) ist 1,067 — eine
 * Schwelle daueber wuerde genau den Fall verfehlen, fuer den dieser Test
 * gebaut ist. Die gaengigen Spruenge (1,2 / 1,25 / 1,33 / 2 / 10 / 100)
 * liegen weit darueber.
 */
export const SKALENSPRUNG_MIN_STANDVERHAELTNIS = 1.05;

/**
 * Wie viele zurueckliegende Werte der Schreibpfad fuer die Erwartung liest.
 *
 * 48 Werte sind bei 15-Minuten-Werten zwoelf Stunden — genug, dass der Median
 * einen vollen Tag-/Nacht-Wechsel zur Haelfte sieht und nicht auf das
 * Nachtniveau allein faellt, und wenig genug, dass die Abfrage ein reiner
 * Index-Scan auf dem juengsten Chunk bleibt.
 */
export const SKALENSPRUNG_HISTORIE_WERTE = 48;

export interface SkalensprungPruefung {
  /** Der neu eingetroffene Zaehlerstand. */
  readonly wertNeu: number;
  /**
   * Die zuletzt GESCHRIEBENEN Werte des Kanals, absteigend nach `ts` —
   * juengster zuerst. `letzteWerte[0]` ist damit derselbe Wert, gegen den
   * die Monotonie prueft.
   */
  readonly letzteWerte: readonly number[];
}

/** Median einer nicht-leeren Zahlenreihe. */
function median(werte: readonly number[]): number {
  const sortiert = [...werte].sort((a, b) => a - b);
  const mitte = Math.floor(sortiert.length / 2);
  if (sortiert.length % 2 === 1) {
    return sortiert[mitte] ?? 0;
  }
  return ((sortiert[mitte - 1] ?? 0) + (sortiert[mitte] ?? 0)) / 2;
}

/**
 * Die Zuwaechse der Historie, absteigend gelesen: `werte[i] - werte[i+1]`.
 *
 * Nur echte, endliche Zuwaechse > 0 gehen in die Erwartung ein. Nullzuwaechse
 * (stillstehende Anlage) wuerden den Median auf 0 druecken, und eine
 * Erwartung von 0 macht JEDEN Zuwachs zum Ausreisser — der Test wuerde bei
 * jeder wieder anlaufenden Anlage anschlagen.
 */
function positiveZuwaechse(werte: readonly number[]): number[] {
  const zuwaechse: number[] = [];
  for (let i = 0; i + 1 < werte.length; i += 1) {
    const juenger = werte[i];
    const aelter = werte[i + 1];
    if (juenger === undefined || aelter === undefined) {
      continue;
    }
    const delta = juenger - aelter;
    if (Number.isFinite(delta) && delta > 0) {
      zuwaechse.push(delta);
    }
  }
  return zuwaechse;
}

/**
 * `true`, wenn der neue Wert den Verdacht eines Skalensprungs traegt.
 *
 * Der Aufrufer ruft das NUR fuer `art='kumulativ_zaehlerstand'` und VOR der
 * Monotonie-Pruefung auf — der spezifische Grund soll den unspezifischen
 * schlagen, solange er zutrifft.
 */
export function istSkalensprungVerdacht({ wertNeu, letzteWerte }: SkalensprungPruefung): boolean {
  const letzterWert = letzteWerte[0];
  if (letzterWert === undefined || !Number.isFinite(letzterWert) || letzterWert <= 0) {
    // Ohne einen positiven Vorgaenger gibt es weder ein Standverhaeltnis noch
    // eine Reife — kein Urteil.
    return false;
  }
  if (!Number.isFinite(wertNeu)) {
    return false;
  }

  const zuwachs = wertNeu - letzterWert;
  if (zuwachs <= 0) {
    // Abwaerts und Stillstand gehoeren nicht hierher (s. Datei-Kopf).
    return false;
  }

  const zuwaechse = positiveZuwaechse(letzteWerte);
  if (zuwaechse.length < SKALENSPRUNG_MIN_STUETZSTELLEN) {
    return false;
  }

  const erwartung = median(zuwaechse);
  if (erwartung <= 0) {
    return false;
  }

  // (1) Reife — vor einem Tag Betriebshistorie schweigt der Test.
  if (letzterWert < SKALENSPRUNG_REIFE_INTERVALLE * erwartung) {
    return false;
  }

  // (2) Nicht als Verbrauch erklaerbar.
  if (zuwachs <= SKALENSPRUNG_AUSREISSER_FAKTOR * erwartung) {
    return false;
  }

  // (3) Als Faktor auf den Zaehlerstand erklaerbar.
  return wertNeu / letzterWert >= SKALENSPRUNG_MIN_STANDVERHAELTNIS;
}
