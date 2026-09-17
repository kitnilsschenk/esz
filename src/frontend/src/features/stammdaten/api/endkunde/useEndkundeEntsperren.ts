import type { EndkundeDetail, EinschraenkungUnterrichtung } from '@edms/shared';
import { createAendernMutation, createStilllegenMutation } from '../shared';
import { endkundeKeys } from './endkundeKeys';
import { postEndkundeUnterrichtung, postEndkundeEntsperren } from './endkundeApi';

/**
 * Schritt 1 des Entsperr-Vorgangs (Art. 18 Abs. 3, ADR-0007 A11.10) —
 * traegt einen Body (`kanal`), daher `createAendernMutation`.
 */
export const useEndkundeUnterrichtung = createAendernMutation<EinschraenkungUnterrichtung, EndkundeDetail>({
  queryKeys: endkundeKeys,
  aendern: postEndkundeUnterrichtung,
});

/**
 * Schritt 2 — die Aufhebung selbst. OHNE Body: die einzige Eingabe war der
 * Grund beim Sperren, und der wird hier nicht wiederholt, sondern
 * aufgehoben. Daher `createStilllegenMutation` (die Fabrik fuer
 * Zustandswechsel ohne Payload) statt `createAendernMutation`.
 */
export const useEndkundeEntsperren = createStilllegenMutation<EndkundeDetail>({
  queryKeys: endkundeKeys,
  stilllegen: postEndkundeEntsperren,
});
