import type { MonatsQualitaetsStufe } from './einsparung';

/** `nachweis.einsparlauf_bindung.behandlung` — v1 kennt NUR `gemessen`/`ausgeschlossen` (s. Klassen-Dok unten). */
export type MonatsBehandlung = 'gemessen' | 'ausgeschlossen';

export interface MonatsKlassifikation {
  readonly behandlung: MonatsBehandlung;
  /**
   * `undefined` bei `belastbar` (kein Preflight-Befund nötig). Regel-Codes
   * gemäß `analytics.verfahren_version` (code=`foerderjahr_preflight_de02`,
   * V0024) — aus der DB gelesen, hier NICHT hartkodiert dupliziert (die
   * KONSTANTEN Regel-Codes selbst sind Teil der App-Logik, ihre SCHWERE ist
   * es laut Katalog ebenfalls, s. Klassen-Dok).
   */
  readonly befund?: { readonly regelCode: 'FJ-03' | 'FJ-04'; readonly schwere: 'hinweis' | 'warnung' };
}

/**
 * ADR-0007 B4 (FJ-03/FJ-04) + B13.3 (Lückenregel `ausschluss_nicht_
 * ausweisbar`, B14 bestätigt) — GEMEINSAME, reine Klassifikationslogik für
 * PREFLIGHT (`PreflightService`, erzeugt NUR Befunde) UND EINSPARLAUF
 * (`EinsparlaufService`, erzeugt zusätzlich `einsparlauf_bindung.behandlung`
 * + speist `einsparungJahr()`) — EINE Quelle der Wahrheit statt zweier
 * divergierender Kopien (Wartungsrisiko sonst: Preflight sagt „Befund X", der
 * Lauf behandelt denselben Monat anders).
 *
 * - `belastbar` → `gemessen`, KEIN Befund.
 * - `eingeschraenkt` → weiterhin `gemessen` (B13.1: `M_FJ_ausweisbar` schließt
 *   NUR `nicht_ausweisbar` aus), aber `FJ-04`/`warnung` ("gebundener Monat
 *   eingeschraenkt ... Warnung + Pflichtausweis", B4-Tabelle wörtlich).
 * - `nicht_ausweisbar` → `ausgeschlossen` (aus der Summe genommen, B13.3).
 *   B4 nennt `FJ-03` als BLOCKER, ABER NUR „ohne dokumentierte Behandlung" —
 *   v1 hat GENAU EINE Lückenregel (`ausschluss_nicht_ausweisbar`, B13.3/B14
 *   bestätigt, KEINE Hochrechnung/Ersatz implementiert), jeder
 *   `nicht_ausweisbar`-Monat ist damit IMMER dokumentiert behandelt — `FJ-03`
 *   kann in v1 folglich NIEMALS als Blocker feuern. Damit DE-02 die Lücke
 *   trotzdem sichtbar bleibt (nicht stillschweigend nur in der
 *   Abdeckungs-Prozentzahl verschwindet), wird sie als `hinweis` (NICHT
 *   `blocker`) protokolliert — eigene, hier dokumentierte Design-Entscheidung
 *   (kein Blocker existiert in der DB für „dokumentierte, ausgeschlossene
 *   Lücke", nur für den — in v1 unerreichbaren — Undokumentiert-Fall).
 */
export function klassifiziereMonat(qualitaetsStufe: MonatsQualitaetsStufe): MonatsKlassifikation {
  if (qualitaetsStufe === 'belastbar') {
    return { behandlung: 'gemessen' };
  }
  if (qualitaetsStufe === 'eingeschraenkt') {
    return { behandlung: 'gemessen', befund: { regelCode: 'FJ-04', schwere: 'warnung' } };
  }
  return { behandlung: 'ausgeschlossen', befund: { regelCode: 'FJ-03', schwere: 'hinweis' } };
}
