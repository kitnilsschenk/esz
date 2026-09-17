// Gezielt exportierte, fachlich benannte Typen aus den generierten
// OpenAPI-Rohtypen (`./generated/messwerte`). Die generated/-Rohtypen selbst
// werden bewusst NICHT pauschal re-exportiert (siehe `index.ts` und die
// analoge Konvention in `stammdatenTypes.ts`).
//
// Ursprünglich deckte diese Datei AUSSCHLIESSLICH Route A
// (`GET /messwerte/standorte/{standortId}/verbrauch`, `read:verbrauch_aggregat`,
// PII-frei) ab — die Standort-Baum-Verbrauchsanzeige. Route B
// (`GET /messwerte/messkanaele/{messkanalId}`, break-glass
// `read:verbrauch_detail`) wird additiv ergänzt für die Zähler-Detailseiten-
// Aktion „Lastgang ansehen" (Betriebs-UI-Konzept Punkt 3.4) — NICHT als
// Dauer-Diagramm, sondern ausschließlich hinter dem zweckgebundenen,
// auditierten CTA (`MesskanalLastgangDialog`).

import type { components } from './generated/messwerte';

export type Aufloesung = components['schemas']['Aufloesung'];
export type VerbrauchAggregatPunkt = components['schemas']['VerbrauchAggregatPunkt'];
export type VerbrauchAggregatMetadaten = components['schemas']['VerbrauchAggregatMetadaten'];
export type VerbrauchAggregatAntwort = components['schemas']['VerbrauchAggregatAntwort'];
// Route B (break-glass, `read:verbrauch_detail`) — Rohwerte inkl. Qualität/Herkunft.
// `MessgroesseArt` wird bewusst NICHT erneut exportiert (identisches Schema
// bereits über `stammdatenTypes.ts` verfügbar, keine Doppel-Deklaration).
export type MesswertQualitaet = components['schemas']['MesswertQualitaet'];
export type MesswertHerkunft = components['schemas']['MesswertHerkunft'];
export type MesswertRohPunkt = components['schemas']['MesswertRohPunkt'];
export type MesswertZeitreiheAntwort = components['schemas']['MesswertZeitreiheAntwort'];
