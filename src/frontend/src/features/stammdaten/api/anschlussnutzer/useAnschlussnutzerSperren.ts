import type { AnschlussnutzerDetail, AnschlussnutzerSperren } from '@edms/shared';
import { createAendernMutation } from '../shared';
import { anschlussnutzerKeys } from './anschlussnutzerKeys';
import { postAnschlussnutzerSperren } from './anschlussnutzerApi';

/**
 * Hook fuer `operationId: anschlussnutzerSperren`
 * (`POST /stammdaten/anschlussnutzer/{anschlussnutzerId}/sperren`, Art. 18).
 *
 * `createAendernMutation` wie beim Endkunden — die Aktion traegt einen Body,
 * `createStilllegenMutation` ist auf `TVariables = string` festgelegt.
 */
export const useAnschlussnutzerSperren = createAendernMutation<AnschlussnutzerSperren, AnschlussnutzerDetail>({
  queryKeys: anschlussnutzerKeys,
  aendern: postAnschlussnutzerSperren,
});
