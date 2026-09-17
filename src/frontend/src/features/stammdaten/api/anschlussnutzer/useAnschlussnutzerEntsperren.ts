import type { AnschlussnutzerDetail, EinschraenkungUnterrichtung } from '@edms/shared';
import { createAendernMutation, createStilllegenMutation } from '../shared';
import { anschlussnutzerKeys } from './anschlussnutzerKeys';
import { postAnschlussnutzerUnterrichtung, postAnschlussnutzerEntsperren } from './anschlussnutzerApi';

/**
 * Schritt 1 des Entsperr-Vorgangs (Art. 18 Abs. 3, ADR-0007 A11.10) —
 * traegt einen Body (`kanal`), daher `createAendernMutation`.
 */
export const useAnschlussnutzerUnterrichtung = createAendernMutation<EinschraenkungUnterrichtung, AnschlussnutzerDetail>({
  queryKeys: anschlussnutzerKeys,
  aendern: postAnschlussnutzerUnterrichtung,
});

/**
 * Schritt 2 — die Aufhebung selbst. OHNE Body: die einzige Eingabe war der
 * Grund beim Sperren, und der wird hier nicht wiederholt, sondern
 * aufgehoben. Daher `createStilllegenMutation` (die Fabrik fuer
 * Zustandswechsel ohne Payload) statt `createAendernMutation`.
 */
export const useAnschlussnutzerEntsperren = createStilllegenMutation<AnschlussnutzerDetail>({
  queryKeys: anschlussnutzerKeys,
  stilllegen: postAnschlussnutzerEntsperren,
});
