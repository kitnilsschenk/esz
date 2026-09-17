/**
 * Zeitscheiben — die gemeinsame Zerlegung eines Zeitraums in Kalendermonate,
 * deren RANDMONATE angeschnitten sein dürfen.
 *
 * Liegt in `common/`, weil zwei fachlich getrennte Kontexte dieselbe
 * Zerlegung brauchen und sie sich nicht auseinanderentwickeln darf: die
 * BERECHNUNG (`berechnung/berechnungslauf.service.ts`, die je Scheibe
 * Referenz und Ist bildet) und der NACHWEIS (`nachweis/einsparlauf.service.ts`
 * und `preflight.service.ts`, die je Scheibe eine Bindung an einen
 * Berechnungslauf auflösen). Zwei Kopien hiesse: Der Preflight erwartet
 * Scheiben, die der Lauf nie gebildet hat.
 */

const MS_JE_TAG = 24 * 60 * 60 * 1000;

export interface Monatsscheibe {
  /**
   * Der Monatserste — die KENNUNG der Scheibe.
   *
   * Sie ist Teil des Primärschlüssels von `analytics.laufergebnis` und trägt
   * dort einen CHECK auf `date_trunc('month', …)`. Bei einer angeschnittenen
   * Scheibe ist das NICHT ihr erster Tag; dafür steht `von`.
   */
  readonly monat: string;
  /** ISO `YYYY-MM-DD`, erster Tag DER SCHEIBE. Bei einem angeschnittenen Rand nicht der Monatserste. */
  readonly von: string;
  /** ISO `YYYY-MM-DD`, EXKLUSIV — erster Tag NACH der Scheibe. */
  readonly bis: string;
  /** Tage IN DER SCHEIBE — nicht im Kalendermonat. */
  readonly tageImZeitraum: number;
  /** `true`, wenn die Scheibe den Kalendermonat nicht vollständig abdeckt. */
  readonly angeschnitten: boolean;
}

function toIsoTag(datum: Date): string {
  const jahr = String(datum.getUTCFullYear()).padStart(4, '0');
  const monat = String(datum.getUTCMonth() + 1).padStart(2, '0');
  const tag = String(datum.getUTCDate()).padStart(2, '0');
  return `${jahr}-${monat}-${tag}`;
}

/** `true`, wenn `datum` (ISO `YYYY-MM-DD`) der ERSTE Kalendertag eines Monats ist. */
export function istMonatsanfang(datum: string): boolean {
  return new Date(`${datum}T00:00:00.000Z`).getUTCDate() === 1;
}

/**
 * Zerlegt `[von, bis)` in Kalendermonate — die RANDMONATE dürfen dabei
 * angeschnitten sein.
 *
 * **Warum das so sein muss.** Ein Förderjahr ist der Zeitraum aus dem
 * Bewilligungsbescheid und beginnt nicht zwangsläufig am Monatsersten; das
 * Technische Merkblatt v2.2 verlangt in Kap. 9.1 ausdrücklich, Einsparungen
 * „zeitanteilig zu ermitteln, soweit der für die Berechnung der Einsparung
 * relevante Zeitraum kleiner ist als das Förderjahr". Ein Raster, das nur
 * ganze Kalendermonate kennt, kann einen Bewilligungszeitraum vom 12.10. bis
 * 11.10. nicht abbilden — er ließe sich nur auf Monatsgrenzen runden, und
 * das verschiebt den Nachweiszeitraum um Wochen.
 *
 * **Die Rechenvorschrift trägt das bereits.** `referenzMonat()` skaliert den
 * Grundlastanteil über `tageImMonat / tageProJahr` und den Witterungsanteil
 * über das Verhältnis der Gradtagzahlen — und Gradtagzahlen sind Tageswerte,
 * deren Summe über eine kürzere Scheibe einfach kleiner ausfällt. Es genügt
 * daher, die TAGE DER SCHEIBE zu übergeben statt der Tage des Kalendermonats;
 * an der Formel selbst ändert sich nichts (sie bleibt bitgleich, die Golden
 * Vectors gelten unverändert).
 *
 * Die Scheibe behält den Monatsersten als `monat` — er bleibt die Kennung in
 * `analytics.laufergebnis`. Zwei Läufe können denselben Kalendermonat
 * angeschnitten führen (das Ende des einen und der Beginn des nächsten
 * Förderjahres); sie unterscheiden sich über `von`/`bis` und die Lauf-Kennung.
 */
export function enumerateMonths(von: string, bis: string): Monatsscheibe[] {
  const start = new Date(`${von}T00:00:00.000Z`);
  const ende = new Date(`${bis}T00:00:00.000Z`);
  const monate: Monatsscheibe[] = [];

  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor.getTime() < ende.getTime()) {
    const naechsterMonat = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));

    // Die Scheibe ist der Schnitt aus Kalendermonat und angefragtem Zeitraum.
    const scheibeVon = new Date(Math.max(cursor.getTime(), start.getTime()));
    const scheibeBis = new Date(Math.min(naechsterMonat.getTime(), ende.getTime()));
    const tageImZeitraum = Math.round((scheibeBis.getTime() - scheibeVon.getTime()) / MS_JE_TAG);
    const tageImMonat = Math.round((naechsterMonat.getTime() - cursor.getTime()) / MS_JE_TAG);

    if (tageImZeitraum > 0) {
      monate.push({
        monat: toIsoTag(cursor),
        von: toIsoTag(scheibeVon),
        bis: toIsoTag(scheibeBis),
        tageImZeitraum,
        angeschnitten: tageImZeitraum !== tageImMonat,
      });
    }
    cursor = naechsterMonat;
  }

  return monate;
}

/** Alle Kalendertage in `[von, bis)`, ISO `YYYY-MM-DD`. */
export function enumerateDays(von: string, bis: string): string[] {
  const start = new Date(`${von}T00:00:00.000Z`);
  const ende = new Date(`${bis}T00:00:00.000Z`);
  const tage: string[] = [];

  for (let cursor = start; cursor.getTime() < ende.getTime(); cursor = new Date(cursor.getTime() + MS_JE_TAG)) {
    tage.push(toIsoTag(cursor));
  }

  return tage;
}
