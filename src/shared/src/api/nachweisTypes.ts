// Gezielt exportierte, fachlich benannte Typen aus den generierten
// OpenAPI-Rohtypen (`./generated/nachweis`). Die generated/-Rohtypen selbst
// werden bewusst NICHT pauschal re-exportiert (siehe `index.ts` und die
// analoge Konvention in `stammdatenTypes.ts`/`berechnungTypes.ts`).
//
// Deckt den vollständigen Nachweis-Kontext ab (ADR-0007 Teil B/C, Stufe 1+2 —
// `schemas/openapi/nachweis.openapi.yaml`): Förderjahr, Preflight,
// Einspar-Lauf, Export, Einreichung. Alle Ressourcen sind APPEND-ONLY (weder
// PATCH noch DELETE) — es gibt daher bewusst keine `*Aendern`-Typen.
//
// Nicht erneut exportiert, weil identisch bereits über andere Module
// verfügbar (keine Doppel-Deklaration, analog `Energietraeger` in
// `berechnungTypes.ts`):
//  - `SeitenInfo`      -> `stammdatenTypes.ts`
//  - `QualitaetsStufe` -> `berechnungTypes.ts` (dieselbe ADR-0006-Domäne;
//    die abweichende JAHRES-Stufe steckt inline in `EinsparlaufErgebnis
//    .qualitaetsStufeMin` und trägt dort `nicht_nachweisbar` statt
//    `nicht_ausweisbar` — s. `nachweis.openapi.yaml`).

import type { components } from './generated/nachweis';

// --- Förderjahr (O1/B4) -------------------------------------------------
export type DefinitionQuelle = components['schemas']['DefinitionQuelle'];
export type Foerderjahr = components['schemas']['Foerderjahr'];
export type FoerderjahrAnlegen = components['schemas']['FoerderjahrAnlegen'];
export type FoerderjahrListe = components['schemas']['FoerderjahrListe'];

// --- Preflight (DE-02/D4) -----------------------------------------------
export type PreflightAusfuehren = components['schemas']['PreflightAusfuehren'];
export type PreflightErgebnis = components['schemas']['PreflightErgebnis'];
export type Preflight = components['schemas']['Preflight'];
export type PreflightSchwere = components['schemas']['PreflightSchwere'];
export type PreflightBefund = components['schemas']['PreflightBefund'];
export type PreflightMitBefunden = components['schemas']['PreflightMitBefunden'];
export type PreflightBefundListe = components['schemas']['PreflightBefundListe'];

// --- Einspar-Lauf (D1/D2/B13) -------------------------------------------
export type EinsparlaufArt = components['schemas']['EinsparlaufArt'];
export type EinsparlaufAusloeser = components['schemas']['EinsparlaufAusloeser'];
export type EinsparlaufAnlegen = components['schemas']['EinsparlaufAnlegen'];
export type EinsparlaufErgebnisStatus = components['schemas']['EinsparlaufErgebnisStatus'];
export type AusschlussGrundCode = components['schemas']['AusschlussGrundCode'];
export type EinsparlaufErgebnis = components['schemas']['EinsparlaufErgebnis'];
export type EinsparlaufAntwort = components['schemas']['EinsparlaufAntwort'];
export type EinsparlaufListItem = components['schemas']['EinsparlaufListItem'];
export type EinsparlaufListe = components['schemas']['EinsparlaufListe'];
export type EinsparlaufErgebnisListe = components['schemas']['EinsparlaufErgebnisListe'];
export type MonatsBehandlung = components['schemas']['MonatsBehandlung'];
export type EinsparlaufBindung = components['schemas']['EinsparlaufBindung'];
export type EinsparlaufBindungListe = components['schemas']['EinsparlaufBindungListe'];

/**
 * Jahres-Qualitätsstufe EINER Ergebniszeile (B13.3) — eigene Domäne mit
 * `nicht_nachweisbar` statt `nicht_ausweisbar`. In der Spec inline am Feld
 * deklariert (kein eigenes `components.schemas`-Objekt), hier für die
 * Oberfläche benannt, damit Label-/Badge-Abbildungen typsicher über ALLE
 * Werte gehen.
 */
export type JahresQualitaetsStufe = EinsparlaufErgebnis['qualitaetsStufeMin'];

// --- Export (D5/D6, Auflagen A13/A14/A15/A19/A23) -----------------------
export type NachweisExportZweck = components['schemas']['NachweisExportZweck'];
export type ExportStationDarstellung = components['schemas']['ExportStationDarstellung'];
export type NachweisExportErzeugen = components['schemas']['NachweisExportErzeugen'];
export type ExportKategorie = components['schemas']['ExportKategorie'];
export type NachweisExportDatei = components['schemas']['NachweisExportDatei'];
export type NachweisExportAntwort = components['schemas']['NachweisExportAntwort'];

// --- Einreichung (D7, Auflagen A18/A21/A22) -----------------------------
export type EinreichungArt = components['schemas']['EinreichungArt'];
export type EinreichungUebermittlungsweg = components['schemas']['EinreichungUebermittlungsweg'];
export type KorrekturGrundCode = components['schemas']['KorrekturGrundCode'];
export type EinreichungAnlegen = components['schemas']['EinreichungAnlegen'];
export type Einreichung = components['schemas']['Einreichung'];
export type EinreichungDifferenzZeile = components['schemas']['EinreichungDifferenzZeile'];
export type EinreichungDifferenzListe = components['schemas']['EinreichungDifferenzListe'];

/** ADR-0007 A18/A11.12 — Mitteilungspflichten nach Art. 19 DSGVO. */
export type Art19PflichtReport = components['schemas']['Art19PflichtReport'];
export type Art19PflichtItem = components['schemas']['Art19PflichtItem'];
export type Art19MitteilungAnlegen = components['schemas']['Art19MitteilungAnlegen'];
export type Art19Anlass = components['schemas']['Art19Anlass'];
