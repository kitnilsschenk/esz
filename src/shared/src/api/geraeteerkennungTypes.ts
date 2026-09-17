// Gezielt exportierte, fachlich benannte Typen aus den generierten
// OpenAPI-Rohtypen (`./generated/geraeteerkennung`). Die generated/-Rohtypen
// selbst werden bewusst NICHT pauschal re-exportiert (Konvention aus
// `stammdatenTypes.ts`/`nachweisTypes.ts`/`consentTypes.ts`).
//
// Deckt TB-05 ab ([Q3] Kap. 5 -- `schemas/openapi/geraeteerkennung.openapi.yaml`):
// Geraetegruppen, Zuordnung von Messkanaelen und die Zuordnungsquote.
//
// Es gibt bewusst KEINEN `*Aendern`-Typ. Eine Zuordnung wird nicht bearbeitet:
// Sie wird beendet und eine neue angelegt -- sonst verschoebe sich
// rueckwirkend die Quote der Vergangenheit.

import type { components } from './generated/geraeteerkennung';

export type Erkennungsmethode = components['schemas']['Erkennungsmethode'];
export type Geraetegruppe = components['schemas']['Geraetegruppe'];
export type GeraetegruppeAnlegen = components['schemas']['GeraetegruppeAnlegen'];
export type GeraeteZuordnung = components['schemas']['Zuordnung'];
export type GeraeteZuordnungAnlegen = components['schemas']['ZuordnungAnlegen'];
export type GeraeteZuordnungBeenden = components['schemas']['ZuordnungBeenden'];
export type Entbehrlichkeit = components['schemas']['Entbehrlichkeit'];
export type EntbehrlichVermerken = components['schemas']['EntbehrlichVermerken'];
export type GruppenAnteil = components['schemas']['GruppenAnteil'];
export type ZuordnungsQuote = components['schemas']['ZuordnungsQuote'];
