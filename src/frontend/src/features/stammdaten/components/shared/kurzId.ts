// Gekürzte, für Menschen überschaubare Anzeige eines UUID-Pseudonym-Surrogats
// (erste 8 Zeichen) — Anzeige-Konvention aller Stammdaten-Tabellen/-Auswahllisten
// (ADR-0008 §23 / D11 Pass 1). `EndkundenTabelle.tsx` importierte anfangs
// noch eine eigene private Kopie; seit Feature-Pass A (Quick-Win N1) nutzt
// auch sie diese geteilte Fassung — alle 7 Entitäts-Tabellen sind damit
// vereinheitlicht.
export function kurzId(id: string): string {
  return id.slice(0, 8);
}
