// Reine Geometrie-/Skalierungsfunktionen des Balkendiagramms — bewusst OHNE
// React/DOM-Bezug (Testbarkeit, "keine Business-/Layout-Logik im JSX").
// `VerbrauchBalkendiagramm.tsx` konsumiert diese Funktionen nur, ändert sie
// nicht selbst.

export const DIAGRAMM_BREITE = 720;
export const DIAGRAMM_HOEHE = 280;

const RAND_OBEN = 16;
const RAND_UNTEN = 36;
const RAND_LINKS = 56;
const RAND_RECHTS_STANDARD = 16;

/** Mark-Spezifikation (dataviz-Skill, fest über alle Diagramme): 4px abgerundetes Datenende. */
export const BALKEN_RADIUS = 4;
/** Mark-Spezifikation: Balken NIE den ganzen Slot füllen — deckeln. */
export const BALKEN_MAX_BREITE = 24;
/** Die zweite "Spacer"-Vorgabe: 2px Lücke zwischen benachbarten Balken. */
const BALKEN_LUECKE = 2;

/** Zeilenhöhe der Direktbeschriftung je Serie (rechter Rand, bei ≥2 Serien). */
export const DIREKTLABEL_ZEILENHOEHE = 16;

/** Grobe Zeichenbreite (px-Einheiten im viewBox-Koordinatensystem) für Kollisions-/Rand-Berechnung — keine echte Textmessung nötig, da das Layout selbst gerechnet wird (kein DOM-`getBBox()` in jsdom verfügbar). */
const ZEICHEN_BREITE = 6.2;

export interface DiagrammRand {
  readonly oben: number;
  readonly unten: number;
  readonly links: number;
  readonly rechts: number;
}

/** Reserviert zusätzlichen rechten Rand für die Direktbeschriftung (0, wenn keine Serie eine Direktbeschriftung braucht). */
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

/** Größtes Element ohne Spread (robust auch bei sehr vielen Buckets — kein Stack-/Argument-Limit-Risiko wie bei `Math.max(...array)`). */
export function maxOf(werte: readonly number[]): number {
  let ergebnis = 0;
  for (const wert of werte) {
    if (wert > ergebnis) {
      ergebnis = wert;
    }
  }
  return ergebnis;
}

/** Größter definierter Wert über alle Serien (Lücken/`undefined` werden ignoriert) — Basis der y-Achsen-Skalierung. */
export function berechneMaxWert(serien: readonly { readonly werte: readonly (number | undefined)[] }[]): number {
  let ergebnis = 0;
  for (const serie of serien) {
    for (const wert of serie.werte) {
      if (wert !== undefined && wert > ergebnis) {
        ergebnis = wert;
      }
    }
  }
  return ergebnis;
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

/** Y-Achsen-Ticks an "sauberen" Zahlen (dataviz-Skill: "round to clean numbers"). Letzter Tick = y-Achsen-Maximum. */
export function berechneYAchse(maxWert: number, zielTickAnzahl = 4): readonly number[] {
  if (maxWert <= 0) {
    return [0];
  }
  const schritt = schoenerSchritt(maxWert / zielTickAnzahl);
  const ticks: number[] = [0];
  // Bis MINDESTENS ein Tick den Maximalwert erreicht/überschreitet — NICHT
  // "letzter Kandidat <= Maximalwert" (das würde bei einer nach oben
  // gerundeten Schrittweite, z. B. 93 -> Schritt 50, den Maximalwert
  // UNTERDECKEN: 0/50 ohne einen Tick >= 93).
  let wert = 0;
  while (wert < maxWert - schritt / 1000) {
    wert += schritt;
    ticks.push(Math.round(wert * 1000) / 1000);
  }
  return ticks;
}

export interface BalkenPosition {
  readonly bucketIndex: number;
  readonly serienIndex: number;
  /** x-Position (relativ zur Plot-Fläche) des SICHTBAREN Balkens (bereits zentriert im Slot, ggf. gedeckelt auf `BALKEN_MAX_BREITE`). */
  readonly balkenX: number;
  readonly balkenBreite: number;
}

/**
 * Geclusterte Balkenpositionen: JE Bucket ein Band, JE Serie ein Slot
 * innerhalb des Bands. Die 2px-Lücke gilt einheitlich zwischen JEDEM Paar
 * benachbarter Balken (innerhalb eines Bands UND zwischen zwei Bands) — der
 * Bucket-Wechsel wird über die x-Achsen-Beschriftung erkennbar, nicht über
 * eine größere Cluster-Lücke.
 */
export function berechneBalkenPositionen(anzahlBuckets: number, anzahlSerien: number, plotBreite: number): readonly BalkenPosition[] {
  if (anzahlBuckets === 0 || anzahlSerien === 0) {
    return [];
  }
  const bandBreite = plotBreite / anzahlBuckets;
  const slotBreite = bandBreite / anzahlSerien;
  const balkenBreite = Math.max(Math.min(slotBreite - BALKEN_LUECKE, BALKEN_MAX_BREITE), 1);

  const positionen: BalkenPosition[] = [];
  for (let bucketIndex = 0; bucketIndex < anzahlBuckets; bucketIndex += 1) {
    const bandStartX = bucketIndex * bandBreite;
    for (let serienIndex = 0; serienIndex < anzahlSerien; serienIndex += 1) {
      const slotStartX = bandStartX + serienIndex * slotBreite;
      positionen.push({
        bucketIndex,
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
 * `''` bei `hoehe <= 0` (Aufrufer zeichnet dann bewusst NICHTS — weder ein
 * `wert: 0` NOCH eine Lücke dürfen als sichtbarer Balken erscheinen).
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
 * Wählt eine Teilmenge der Bucket-Indizes für die x-Achsen-Beschriftung aus,
 * DAMIT sich Labels nicht überlappen (KollisionsVERMEIDUNG durch Auslassen —
 * NIE durch Rotation/Abschneiden, s. `marks-and-anatomy.md`: "measure first").
 * Enthält immer Index 0; Index `anzahlBuckets - 1` NUR, wenn genug Abstand
 * zum vorherigen gewählten Label besteht (sonst Kollision am rechten Rand).
 */
export function waehleAchsenLabelIndizes(anzahlBuckets: number, bandBreite: number, geschaetzteLabelBreite: number): readonly number[] {
  if (anzahlBuckets === 0) {
    return [];
  }
  const schrittweite = Math.max(1, Math.ceil(geschaetzteLabelBreite / bandBreite));
  const indizes: number[] = [];
  for (let index = 0; index < anzahlBuckets; index += schrittweite) {
    indizes.push(index);
  }
  const letzterIndex = anzahlBuckets - 1;
  const vorletztesGewaehltes = indizes[indizes.length - 1];
  if (vorletztesGewaehltes !== letzterIndex) {
    const abstand = vorletztesGewaehltes === undefined ? Infinity : (letzterIndex - vorletztesGewaehltes) * bandBreite;
    if (abstand >= geschaetzteLabelBreite) {
      indizes.push(letzterIndex);
    }
  }
  return indizes;
}
