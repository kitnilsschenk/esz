// Gezielt exportierte, fachlich benannte Typen aus den generierten
// OpenAPI-Rohtypen (`./generated/nutzerinfo`). Die generated/-Rohtypen selbst
// werden bewusst NICHT pauschal re-exportiert (Konvention aus
// `stammdatenTypes.ts`/`nachweisTypes.ts`/`consentTypes.ts`).
//
// Deckt die monatliche Nutzerinformation ab (TB-06 —
// `schemas/openapi/nutzerinfo.openapi.yaml`): Erzeugungslauf, Verlauf je
// Endkunde und Versand-/Bereitstellungsnachweis.
//
// Es gibt bewusst KEINEN `*Aendern`-Typ. Eine erzeugte Information wird nicht
// bearbeitet: Solange sie nicht zugestellt ist, ersetzt ein erneuter Lauf sie
// vollstaendig; ist sie zugestellt, bleibt sie stehen -- der Kunde hat
// gesehen, was er gesehen hat.

import type { components } from './generated/nutzerinfo';

export type Zustellweg = components['schemas']['Zustellweg'];
export type Nutzerinformation = components['schemas']['Nutzerinformation'];
export type NutzerinfoLauf = components['schemas']['NutzerinfoLauf'];
export type NutzerinfoLaufErgebnis = components['schemas']['NutzerinfoLaufErgebnis'];
export type NutzerinfoZustellung = components['schemas']['NutzerinfoZustellung'];
export type NutzerinfoMonatsstand = components['schemas']['NutzerinfoMonatsstand'];
export type NutzerinfoBericht = components['schemas']['NutzerinfoBericht'];
export type BerichtGruppe = components['schemas']['BerichtGruppe'];
export type NutzerinfoSammelZustellung = components['schemas']['NutzerinfoSammelZustellung'];
export type NutzerinfoSammelZustellungErgebnis =
  components['schemas']['NutzerinfoSammelZustellungErgebnis'];
