// Reine Geometrie-/Skalierungsfunktionen des Berechnungslauf-Monatsdiagramms
// — bewusst OHNE React/DOM-Bezug (Testbarkeit, "keine Business-/Layout-Logik
// im JSX"). `BerechnungslaufMonatsBalkendiagramm.tsx` konsumiert diese
// Funktionen nur, ändert sie nicht selbst.
//
// Eigenständige, auf den Berechnungslauf-Anwendungsfall zugeschnittene
// Fassung — KEIN Re-Export aus `../verbrauch/verbrauchDiagrammLayout.ts`:
// jeder Entitäts-Ordner unter `components/<entität>/` bleibt für sich
// abgeschlossen (etablierte Konvention dieses Slices, keine Querimporte
// zwischen Entitäts-Ordnern außer `../shared`). Die Kern-Algorithmen (2px-
// Balkenlücke, 4px-Eckenradius, "runde auf saubere Zahlen" Y-Achse,
// Label-Kollisionsvermeidung durch Auslassen statt Rotation) sind bewusst
// IDENTISCH zur Verbrauchs-Ansicht — dieselbe zugrundeliegende
// dataviz-Spezifikation, hier auf GENAU zwei feste Serien zugeschnitten
// (Referenz `R_m` und Ist, s. `BerechnungslaufMonatsBalkendiagramm.tsx`).
// Anders als bei Verbrauch (Zeit-Bucket-Lücken möglich) ist hier JEDER
// Monatswert vorhanden (`Laufergebnis[]` liefert genau eine Zeile je Monat
// der Periode, `berechnungslauf.types.ts`) — Werte sind daher `number`,
// nicht `number | undefined`.

export const DIAGRAMM_BREITE = 720;
export const DIAGRAMM_HOEHE = 280;

const RAND_OBEN = 16;
const RAND_UNTEN = 36;
const RAND_LINKS = 64;
const RAND_RECHTS_STANDARD = 16;

/** Mark-Spezifikation (fest über alle Diagramme dieses Slices): 4px abgerundetes Datenende. */
export const BALKEN_RADIUS = 4;
/** Mark-Spezifikation: Balken NIE den ganzen Slot füllen — deckeln. */
export const BALKEN_MAX_BREITE = 24;
/** Die zweite "Spacer"-Vorgabe: 2px Lücke zwischen benachbarten Balken. */
const BALKEN_LUECKE = 2;

/** Zeilenhöhe der Direktbeschriftung je Serie (rechter Rand, IMMER 2 Serien → IMMER reserviert). */
export const DIREKTLABEL_ZEILENHOEHE = 16;

/** Grobe Zeichenbreite (px-Einheiten im viewBox-Koordinatensystem) für Kollisions-/Rand-Berechnung — kein DOM-`getBBox()` in jsdom verfügbar. */
const ZEICHEN_BREITE = 6.2;

export interface DiagrammRand {
  readonly oben: number;
  readonly unten: number;
  readonly links: number;
  readonly rechts: number;
}

/** Reserviert zusätzlichen rechten Rand für die Direktbeschriftung der beiden Serien. */
export function berechneRand(direktLabelBreiteMax: number): DiagrammRand {
  return {
    oben: RAND_OBEN,
    unten: RAND_UNTEN,
    links: RAND_LINKS,
    rechts: RAND_RECHTS_STANDARD + direktLabelBreiteMax,
  };
}

export function schaetzeTextbreite(text: string): number {
  return text.length * ZEICHEN_BREITE;
}

/** Größtes Element ohne Spread (robust auch bei vielen Monaten — kein Stack-/Argument-Limit-Risiko wie bei `Math.max(...array)`). */
export function maxOf(werte: readonly number[]): number {
  let ergebnis = 0;
  for (const wert of werte) {
    if (wert > ergebnis) {
      ergebnis = wert;
    }
  }
  return ergebnis;
}

/** Größter Wert über Referenz- UND Ist-Reihe — Basis der y-Achsen-Skalierung. */
export function berechneMaxWert(referenzWerte: readonly number[], istWerte: readonly number[]): number {
  return maxOf([...referenzWerte, ...istWerte]);
}

function schoenerSchritt(rohSchritt: number): number {
  if (rohSchritt <= 0) {
    return 1;
  }
  const exponent = Math.floor(Math.log10(rohSchritt));
  const zehnerpotenz = 10 ** exponent;
  const bruch = rohSchritt / zehnerpotenz;
  const schoenerBruch = bruch <= 1 ? 1 : bruch <= 2 ? 2 : bruch <= 5 ? 5 : 10;
  return schoenerBruch * zehnerpotenz;
}

/** Y-Achsen-Ticks an "sauberen" Zahlen (dataviz-Prinzip: "round to clean numbers"). Letzter Tick = y-Achsen-Maximum. */
export function berechneYAchse(maxWert: number, zielTickAnzahl = 4): readonly number[] {
  if (maxWert <= 0) {
    return [0];
  }
  const schritt = schoenerSchritt(maxWert / zielTickAnzahl);
  const ticks: number[] = [0];
  // Bis MINDESTENS ein Tick den Maximalwert erreicht/überschreitet — NICHT
  // "letzter Kandidat <= Maximalwert" (das würde bei einer nach oben
  // gerundeten Schrittweite den Maximalwert UNTERDECKEN).
  let wert = 0;
  while (wert < maxWert - schritt / 1000) {
    wert += schritt;
    ticks.push(Math.round(wert * 1000) / 1000);
  }
  return ticks;
}

export interface BalkenPosition {
  readonly monatIndex: number;
  readonly serienIndex: 0 | 1;
  /** x-Position (relativ zur Plot-Fläche) des SICHTBAREN Balkens (bereits zentriert im Slot, ggf. gedeckelt auf `BALKEN_MAX_BREITE`). */
  readonly balkenX: number;
  readonly balkenBreite: number;
}

/**
 * Geclusterte Balkenpositionen: JE Monat ein Band, JE Serie (Referenz/Ist,
 * fest 2) ein Slot innerhalb des Bands. Die 2px-Lücke gilt einheitlich
 * zwischen JEDEM Paar benachbarter Balken (innerhalb eines Bands UND zwischen
 * zwei Bands) — der Monatswechsel wird über die x-Achsen-Beschriftung
 * erkennbar, nicht über eine größere Cluster-Lücke.
 */
export function berechneBalkenPositionen(anzahlMonate: number, plotBreite: number): readonly BalkenPosition[] {
  if (anzahlMonate === 0) {
    return [];
  }
  const anzahlSerien = 2;
  const bandBreite = plotBreite / anzahlMonate;
  const slotBreite = bandBreite / anzahlSerien;
  const balkenBreite = Math.max(Math.min(slotBreite - BALKEN_LUECKE, BALKEN_MAX_BREITE), 1);

  const positionen: BalkenPosition[] = [];
  for (let monatIndex = 0; monatIndex < anzahlMonate; monatIndex += 1) {
    const bandStartX = monatIndex * bandBreite;
    for (const serienIndex of [0, 1] as const) {
      const slotStartX = bandStartX + serienIndex * slotBreite;
      positionen.push({
        monatIndex,
        serienIndex,
        balkenX: slotStartX + (slotBreite - balkenBreite) / 2,
        balkenBreite,
      });
    }
  }
  return positionen;
}

/**
 * SVG-Pfad EINES Balkens: 4px abgerundetes Datenende (oben, da der Balken von
 * der Grundlinie nach oben wächst), quadratisch an der Grundlinie. Liefert
 * `''` bei `hoehe <= 0` (Aufrufer zeichnet dann bewusst NICHTS).
 */
export function balkenPfad(x: number, baselineY: number, breite: number, hoehe: number, radius: number = BALKEN_RADIUS): string {
  if (hoehe <= 0) {
    return '';
  }
  const r = Math.max(Math.min(radius, breite / 2, hoehe), 0);
  const y = baselineY - hoehe;
  if (r <= 0.01) {
    return `M ${x} ${baselineY} L ${x} ${y} L ${x + breite} ${y} L ${x + breite} ${baselineY} Z`;
  }
  return [
    `M ${x} ${baselineY}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + breite - r} ${y}`,
    `Q ${x + breite} ${y} ${x + breite} ${y + r}`,
    `L ${x + breite} ${baselineY}`,
    'Z',
  ].join(' ');
}

/**
 * Wählt eine Teilmenge der Monats-Indizes für die x-Achsen-Beschriftung aus,
 * DAMIT sich Labels nicht überlappen (Kollisionsvermeidung durch Auslassen —
 * NIE durch Rotation/Abschneiden: "measure first"). Enthält immer Index 0;
 * den letzten Index NUR, wenn genug Abstand zum vorherigen gewählten Label
 * besteht (sonst Kollision am rechten Rand).
 */
export function waehleAchsenLabelIndizes(anzahlMonate: number, bandBreite: number, geschaetzteLabelBreite: number): readonly number[] {
  if (anzahlMonate === 0) {
    return [];
  }
  const schrittweite = Math.max(1, Math.ceil(geschaetzteLabelBreite / bandBreite));
  const indizes: number[] = [];
  for (let index = 0; index < anzahlMonate; index += schrittweite) {
    indizes.push(index);
  }
  const letzterIndex = anzahlMonate - 1;
  const vorletztesGewaehltes = indizes[indizes.length - 1];
  if (vorletztesGewaehltes !== letzterIndex) {
    const abstand = vorletztesGewaehltes === undefined ? Infinity : (letzterIndex - vorletztesGewaehltes) * bandBreite;
    if (abstand >= geschaetzteLabelBreite) {
      indizes.push(letzterIndex);
    }
  }
  return indizes;
}
