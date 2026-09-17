import { createResourceQueryKeys } from '../shared';

// Query-Key-Factory der Standort-Ressource (analog `zaehlerKeys.ts`). Deckt
// NUR die generische `detail`/`all`-Form ab — die beiden fachlich
// eigenständigen Lesestufen (D5: Struktur-Baum vs. PII-Label-Batch) haben
// KEINE Cursor-Pagination (ADR-0010 §5 wörtlich, `standorteListe`-Doku-
// Kommentar) und passen daher NICHT in `.liste(filter)`/`.listen()` der
// generischen Fabrik (die Cursor-Paginierung voraussetzt) — dafür die
// dedizierten Schlüssel-Fabriken unten.
export const standortKeys = createResourceQueryKeys('standort');

/**
 * Struktur-Baum EINES Endkunden (`GET .../standorte`, `read:standort`,
 * D5 Linie 1 — PII-frei). Eine flache Liste je Endkunde, kein Filter-Objekt
 * nötig (v1 lädt den GESAMTEN Baum — Tiefenlimit 0-9, D2.3, begrenzt die
 * Knotenzahl strukturell, s. `useStandortBaum.ts`).
 */
export function standortBaumKey(endkundeId: string): readonly [string, 'baum', string] {
  return [...standortKeys.all, 'baum', endkundeId] as const;
}

/**
 * Batch-Labels EINES Endkunden für eine bestimmte Knotenmenge (`POST
 * .../standorte/labels`, `read:standort_pii`, D5 Linie 2). Der Schlüssel
 * bindet die SORTIERTE Id-Menge — jede Änderung der sichtbaren Knotenmenge
 * (Auf-/Zuklappen im Baum) erzeugt einen NEUEN Schlüssel und damit GENAU
 * EINEN neuen Batch-Aufruf für die gesamte aktuell sichtbare Menge (s.
 * `useStandortLabels.ts`-Klassen-Dok für die bewusste Abwägung gegen einen
 * inkrementellen Delta-Nachlade-Mechanismus).
 */
export function standortLabelsKey(endkundeId: string, standortIds: readonly string[]): readonly [string, 'labels', string, readonly string[]] {
  return [...standortLabelsKeyPraefix(endkundeId), [...standortIds].sort()] as const;
}

/**
 * PRÄFIX (ohne Id-Menge) für `invalidateQueries` NACH einer PII-Änderung
 * (`useStandortPiiAendernView`) — trifft dadurch JEDE bisher gecachte
 * Sichtbarkeits-Variante dieses Endkunden, unabhängig von der exakten
 * Knotenmenge, die zum jeweiligen Zeitpunkt sichtbar war.
 */
export function standortLabelsKeyPraefix(endkundeId: string): readonly [string, 'labels', string] {
  return [...standortKeys.all, 'labels', endkundeId] as const;
}

/**
 * Aktuell (bzw. zum Stichtag) verortete Zähler EINES Standort-Knotens (`GET
 * .../standorte/{id}/zaehler`, `read:standort`, Kern-Query D6).
 */
export function standortZaehlerKey(standortId: string, stichtag?: string): readonly [string, 'zaehler', string, string] {
  return [...standortZaehlerKeyPraefix(standortId), stichtag ?? 'jetzt'] as const;
}

/**
 * PRÄFIX (ohne Stichtag) für `invalidateQueries` NACH einer Verortungs-
 * Mutation (`useZaehlerVerortungAnlegen`/`-Beenden`) — trifft dadurch JEDE
 * Stichtag-Variante dieser Query, nicht nur die aktuell im UI verwendete
 * (v1 nutzt ausschließlich den Default-Stichtag "jetzt", ein künftiger
 * Stichtag-Filter bliebe damit ohne Änderung an den Mutations-Hooks
 * korrekt invalidiert).
 */
export function standortZaehlerKeyPraefix(standortId: string): readonly [string, 'zaehler', string] {
  return [...standortKeys.all, 'zaehler', standortId] as const;
}

/**
 * Aktuelle Verortung EINES Zählers inkl. Breadcrumb-Pfad (`GET
 * .../zaehler/{id}/verortung`, `read:standort`, Betriebs-UI-Konzept Punkt 3).
 * Invalidiert nach jeder erfolgreichen Verorten-/Beenden-Mutation dieses
 * Zählers (s. `useZaehlerVerortungAnlegen.ts`/`useZaehlerVerortungBeenden.ts`).
 */
export function zaehlerAktuelleVerortungKey(zaehlerId: string): readonly [string, 'aktuelleVerortung', string] {
  return [...standortKeys.all, 'aktuelleVerortung', zaehlerId] as const;
}
