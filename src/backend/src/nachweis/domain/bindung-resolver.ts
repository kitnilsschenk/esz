import type { MonatsQualitaetsStufe } from './einsparung';

/** Ein Kandidat für die Monatsbindung — eine Zeile aus `analytics.berechnungslauf` × `analytics.laufergebnis` (gelesen, NIE neu aggregiert, B7). */
export interface BindungsKandidat {
  readonly berechnungslaufId: string;
  readonly erstelltAt: string;
  readonly referenzKwh: number;
  readonly istKwh: number;
  readonly qualitaetsStufe: MonatsQualitaetsStufe;
  readonly parameterHash: string;
  readonly rohdatenHash: string;
}

export type BindungsAufloesungErgebnis =
  | { readonly art: 'kein_kandidat' }
  | { readonly art: 'abweichend'; readonly kandidatenAnzahl: number }
  | { readonly art: 'ok'; readonly gewaehlt: BindungsKandidat; readonly kandidatenAnzahl: number; readonly mehrdeutigGleich: boolean };

/**
 * ADR-0007 B2 (D2) — deterministische, monatsscharfe Bindungsauswahl:
 * „für jedes Paar (Endkunde, Energieträger) und jeden erwarteten Monat wird
 * GENAU EIN `analytics.berechnungslauf` gebunden — der jüngste (`erstellt_at`),
 * selbst nicht ersetzte Lauf, dessen Periode den Monat enthält."
 *
 * Der Aufrufer liefert BEREITS NUR nicht-ersetzte Kandidaten, deren Periode
 * den Monat enthält (SQL-Filter, `AnalyticsLaufLookupRepository`) — diese
 * Funktion trifft NUR noch die "jüngster Kandidat"-Auswahl und die
 * Mehrdeutigkeits-Klassifikation:
 *
 * - 0 Kandidaten → `kein_kandidat` (Aufrufer: `FJ-02`-Blocker).
 * - ≥ 2 Kandidaten mit ABWEICHENDEN `(referenzKwh, istKwh)` → `abweichend`
 *   (Aufrufer: `FJ-05`-Blocker — „nimm die erste" ist laut ADR-0006 D4
 *   VERBOTEN, ein echter Widerspruch in der Rechenhistorie wird NIE
 *   stillschweigend aufgelöst).
 * - ≥ 2 Kandidaten mit IDENTISCHEN Werten → `ok`, `mehrdeutigGleich=true`
 *   (Aufrufer: `FJ-05`-Warnung, `kandidaten_anzahl` im Metablatt/der Bindung
 *   ausgewiesen, D2 wörtlich).
 * - genau 1 Kandidat → `ok`, `mehrdeutigGleich=false`.
 *
 * Der GEWÄHLTE Kandidat ist in JEDEM `ok`-Fall der mit dem größten
 * `erstelltAt` (bei identischen Werten ohnehin gleichgültig, bei Gleichstand
 * der `erstelltAt`-Zeitstempel — strukturell ausgeschlossen, `erstellt_at` ist
 * `DEFAULT now()` und damit faktisch eindeutig — der ERSTE in der vom
 * Aufrufer bereits absteigend sortierten Liste wird verwendet, KEIN erneutes
 * Sortieren hier).
 */
export function loeseBindungAuf(kandidatenAbsteigendNachErstelltAt: readonly BindungsKandidat[]): BindungsAufloesungErgebnis {
  if (kandidatenAbsteigendNachErstelltAt.length === 0) {
    return { art: 'kein_kandidat' };
  }

  const [erster, ...rest] = kandidatenAbsteigendNachErstelltAt;
  if (erster === undefined) {
    return { art: 'kein_kandidat' };
  }

  const kandidatenAnzahl = kandidatenAbsteigendNachErstelltAt.length;
  if (kandidatenAnzahl === 1) {
    return { art: 'ok', gewaehlt: erster, kandidatenAnzahl, mehrdeutigGleich: false };
  }

  const abweichend = rest.some((k) => k.referenzKwh !== erster.referenzKwh || k.istKwh !== erster.istKwh);
  if (abweichend) {
    return { art: 'abweichend', kandidatenAnzahl };
  }

  return { art: 'ok', gewaehlt: erster, kandidatenAnzahl, mehrdeutigGleich: true };
}
