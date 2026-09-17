import type { Einsparlauf, EinsparlaufErgebnis } from './persistence/nachweis-einsparlauf.repository';

/**
 * `POST/GET /nachweis/einsparlaeufe/{id}` — Lauf-Kopf + Jahreszeilen INKLUSIVE
 * Ausschlüssen (DE-02-Vollständigkeit, `nachweis.einsparlauf_ergebnis` hat
 * eine Zeile je Paar, AUCH für `ausgeschlossen`). PII-frei (`endkundeId` ist
 * Pseudonym) — Muster `BerechnungslaufAntwort`.
 */
export interface EinsparlaufAntwort extends Einsparlauf {
  readonly ergebnisse: readonly EinsparlaufErgebnis[];
}

export function mapEinsparlaufAntwort(lauf: Einsparlauf, ergebnisse: readonly EinsparlaufErgebnis[]): EinsparlaufAntwort {
  return { ...lauf, ergebnisse };
}
