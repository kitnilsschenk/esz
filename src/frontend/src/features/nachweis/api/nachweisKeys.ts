import { createResourceQueryKeys } from '../../stammdaten/api/shared';

// Query-Key-Fabriken des Nachweis-Kontexts (ADR-0007 Teil B/C). Eine Fabrik
// je Ressource — die geteilten Bausteine aus `stammdaten/api/shared` werden
// WIEDERVERWENDET, nicht kopiert (dasselbe tut bereits das Dashboard-Feature
// mit `stammdaten/components/shared`).
//
// Die Ressourcennamen tragen alle das Präfix `nachweis-`: Sie stehen im
// selben globalen Query-Cache wie die Stammdaten-Schlüssel, und
// `einsparlauf-ergebnis` allein wäre dort ein zu allgemeiner Name.

export const foerderjahrKeys = createResourceQueryKeys('nachweis-foerderjahr');
export const preflightKeys = createResourceQueryKeys('nachweis-preflight');
export const preflightBefundKeys = createResourceQueryKeys('nachweis-preflight-befund');
export const einsparlaufKeys = createResourceQueryKeys('nachweis-einsparlauf');
export const einsparlaufErgebnisKeys = createResourceQueryKeys('nachweis-einsparlauf-ergebnis');
export const einsparlaufBindungKeys = createResourceQueryKeys('nachweis-einsparlauf-bindung');
export const nachweisExportKeys = createResourceQueryKeys('nachweis-export');
export const einreichungKeys = createResourceQueryKeys('nachweis-einreichung');
export const einreichungDifferenzKeys = createResourceQueryKeys('nachweis-einreichung-differenz');
