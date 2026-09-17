import type { EndkundeDetail, EndkundeSperren } from '@edms/shared';
import { createAendernMutation } from '../shared';
import { endkundeKeys } from './endkundeKeys';
import { postEndkundeSperren } from './endkundeApi';

/**
 * Hook fuer `operationId: endkundeSperren`
 * (`POST /stammdaten/endkunden/{endkundeId}/sperren`, Art. 18 — Verarbeitung
 * einschraenken, KEIN Hard-Delete).
 *
 * Bewusst `createAendernMutation` statt `createStilllegenMutation`: letztere
 * ist auf `TVariables = string` festgelegt und ausdruecklich fuer Aktionen
 * OHNE Eingabe-Payload gebaut. Seit der Einschraenkungsgrund Pflicht ist
 * (ADR-0007 A11.1), traegt die Sperre einen Body — dieselbe `id`+`body`-Form
 * wie das bereits so geloeste „Status mit Payload aendern" beim
 * Nutzungsverhaeltnis (`beenden`). Die geteilte Fabrik bleibt dabei
 * UNVERAENDERT.
 */
export const useEndkundeSperren = createAendernMutation<EndkundeSperren, EndkundeDetail>({
  queryKeys: endkundeKeys,
  aendern: postEndkundeSperren,
});
