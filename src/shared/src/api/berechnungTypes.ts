// Gezielt exportierte, fachlich benannte Typen aus den generierten
// OpenAPI-Rohtypen (`./generated/berechnung`). Die generated/-Rohtypen selbst
// werden bewusst NICHT pauschal re-exportiert (siehe `index.ts` und die
// analoge Konvention in `stammdatenTypes.ts`/`messwerteTypes.ts`).
//
// Deckt AUSSCHLIESSLICH die beiden Lese-Routen ab (ADR-0006 Betriebs-UI,
// `read:berechnungslauf`, Rollen `betrieb`/`compliance-auditor`, PII-frei —
// `endkundeId` ist ein Pseudonym-Surrogat):
//  - `GET /berechnung/endkunden/{endkundeId}/laeufe` (Cursor-Liste)
//  - `GET /berechnung/laeufe/{laufId}` (Detail inkl. Monatsergebnisse)
// `BerechnungslaufAnlegen` (POST, `create:berechnungslauf`) wird bewusst
// NICHT exportiert — v1 der Betriebs-UI baut ausschließlich die beiden
// GET-Routen (Läufe entstehen serverseitig), s. Arbeitsauftrag.
//
// `Energietraeger` wird bewusst NICHT erneut exportiert (identisches Schema
// bereits über `stammdatenTypes.ts` verfügbar, keine Doppel-Deklaration,
// analog `MessgroesseArt` in `messwerteTypes.ts`).

import type { components } from './generated/berechnung';

export type QualitaetsStufe = components['schemas']['QualitaetsStufe'];
export type Ausloeser = components['schemas']['Ausloeser'];
export type Laufergebnis = components['schemas']['Laufergebnis'];
export type BerechnungslaufAntwort = components['schemas']['BerechnungslaufAntwort'];
export type BerechnungslaufListItem = components['schemas']['BerechnungslaufListItem'];
export type BerechnungslaufListe = components['schemas']['BerechnungslaufListe'];

/**
 * Was ein Berechnungslauf braucht, aus dem Bestand hergeleitet
 * (`GET /berechnung/parametervorschlag`). Der Vorschlag traegt seine
 * Herleitung mit — eine Zahl ohne Begruendung waere nur eine besser
 * getarnte Vermutung.
 */
export type BerechnungParametervorschlag = components['schemas']['BerechnungParametervorschlag'];
export type GrundlastHerleitung = components['schemas']['GrundlastHerleitung'];
export type SystemgrenzeQuelle = components['schemas']['SystemgrenzeQuelle'];
export type BerechnungslaufAnlegen = components['schemas']['BerechnungslaufAnlegen'];
