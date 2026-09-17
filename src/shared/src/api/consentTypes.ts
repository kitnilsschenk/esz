// Gezielt exportierte, fachlich benannte Typen aus den generierten
// OpenAPI-Rohtypen (`./generated/consent`). Die generated/-Rohtypen selbst
// werden bewusst NICHT pauschal re-exportiert (Konvention aus
// `stammdatenTypes.ts`/`nachweisTypes.ts`).
//
// Deckt den Consent-Kontext ab (ADR-0012 B1 —
// `schemas/openapi/consent.openapi.yaml`): Zweck-Katalog, versionierte
// Erklaerungen, Einwilligung und Widerruf.
//
// Es gibt bewusst KEINEN `*Aendern`-Typ: Eine Einwilligung wird nicht
// geaendert. Ein Widerruf setzt einen Zeitpunkt (eigene Route), eine erneute
// Einwilligung ist eine neue Zeile, und Erklaerungsfassungen sind
// unveraenderlich.

import type { components } from './generated/consent';

export type SubjektTyp = components['schemas']['SubjektTyp'];
export type Rechtsgrundlage = components['schemas']['Rechtsgrundlage'];
export type Erfassungsweg = components['schemas']['Erfassungsweg'];
export type Erlaubnismodus = components['schemas']['Erlaubnismodus'];

export type ConsentZweck = components['schemas']['Zweck'];
export type ConsentTextVersion = components['schemas']['TextVersion'];
export type ConsentTextVersionVeroeffentlichen = components['schemas']['TextVersionVeroeffentlichen'];

export type Einwilligung = components['schemas']['Einwilligung'];
export type EinwilligungErteilen = components['schemas']['EinwilligungErteilen'];
export type EinwilligungWiderrufen = components['schemas']['EinwilligungWiderrufen'];
/**
 * Der Widerspruch — das Gegenstueck zur Einwilligung fuer die andere Haelfte
 * der Rechtsgrundlagen-Matrix (AW-27, V0052). Wo eine Verarbeitung `opt_out`
 * oder `vertraglich` laeuft, gibt es nichts zu widerrufen; dort widerspricht
 * die betroffene Person bzw. waehlt die Leistung ab.
 */
export type Widerspruch = components['schemas']['Widerspruch'];
export type WiderspruchErklaeren = components['schemas']['WiderspruchErklaeren'];
export type WiderspruchZuruecknehmen = components['schemas']['WiderspruchZuruecknehmen'];

export type SubjektZweckStand = components['schemas']['SubjektZweckStand'];
export type SubjektConsentStand = components['schemas']['SubjektConsentStand'];
