// Gezielt exportierte, fachlich benannte Typen aus den generierten
// OpenAPI-Rohtypen (`./generated/portal`) — dieselbe Konvention wie
// `nutzerinfoTypes.ts`/`consentTypes.ts`.
//
// Deckt `schemas/openapi/portal.openapi.yaml` ab: den Endkunden-Zugang
// (Anmeldung, eigene Monatsinformationen, digitales Opt-out) und die
// Betriebssicht auf die Zugangsvergabe.
//
// `Nutzerinformation` und `NutzerinfoBericht` werden hier bewusst NICHT
// erneut exportiert, obwohl die Portal-Spec sie fuehrt: Es sind dieselben
// Daten, und zwei Namen dafuer waeren die Einladung, sie
// auseinanderlaufen zu lassen. Der Portal-Bereich verwendet die aus
// `nutzerinfoTypes.ts`.

import type { components } from './generated/portal';

export type PortalEinloesenEingabe = components['schemas']['PortalEinloesenEingabe'];
export type PortalAnmeldungEingabe = components['schemas']['PortalAnmeldungEingabe'];
export type PortalAnmeldungAntwort = components['schemas']['PortalAnmeldungAntwort'];
export type PortalIch = components['schemas']['PortalIch'];
export type PortalWiderspruchStand = components['schemas']['PortalWiderspruchStand'];
export type PortalZugangStatus = components['schemas']['PortalZugangStatus'];
export type PortalZugangStand = components['schemas']['PortalZugangStand'];
export type PortalZugangAusgabe = components['schemas']['PortalZugangAusgabe'];
