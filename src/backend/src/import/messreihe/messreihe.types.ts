/**
 * Die Messgrößen, die eine Messreihen-Mappe führen kann.
 *
 * Bewusst geschlossen: Was hier nicht steht, wird beim Einlesen abgewiesen
 * statt stillschweigend übergangen. Eine unbekannte Spalte in einer
 * Verbrauchstabelle ist eine Frage an den Menschen, keine Kleinigkeit für den
 * Importer.
 */
export const MESSGROESSEN = ['wirkarbeit', 'thermische_energie'] as const;
export type ImportMessgroesse = (typeof MESSGROESSEN)[number];

/** Ein Tageswert einer Messgröße. */
export interface Tageswert {
  /** Lokaler Kalendertag, `YYYY-MM-DD`. */
  readonly tag: string;
  readonly kwh: number;
}

/** Eine Spalte des Blattes: eine Messgröße mit ihren Tageswerten. */
export interface Messreihe {
  readonly messgroesse: ImportMessgroesse;
  readonly werte: readonly Tageswert[];
  /**
   * Die Summe aus der Summenzeile des Blattes — die Prüfsumme, die die Mappe
   * selbst mitliefert. `undefined`, wenn das Blatt keine führt.
   */
  readonly summeLautBlatt: number | undefined;
}

/** Ein Förderjahres-Blatt. */
export interface FoerderjahrBlatt {
  readonly blattName: string;
  /** 1..5 — aus dem Blattnamen (`FJ3 2020-2021`). */
  readonly foerderjahr: number;
  readonly vonTag: string;
  readonly bisTag: string;
  readonly reihen: readonly Messreihe[];
}

/** Eine vollständig eingelesene Messreihen-Mappe. */
export interface Messmappe {
  readonly dateiname: string;
  /**
   * Die Anlage, die die Mappe misst — aus der Kopfzeile der Blätter
   * (`… | BHKW`). `undefined` bei der Mappe des Hauptzählers, die keine
   * Anlage nennt.
   */
  readonly anlage: string | undefined;
  readonly blaetter: readonly FoerderjahrBlatt[];
}
