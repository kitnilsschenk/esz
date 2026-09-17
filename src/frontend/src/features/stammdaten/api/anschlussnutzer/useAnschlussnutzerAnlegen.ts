import type { AnschlussnutzerAnlegen, AnschlussnutzerDetail } from '@edms/shared';
import { createAnlegenMutation } from '../shared';
import { anschlussnutzerKeys } from './anschlussnutzerKeys';
import { postAnschlussnutzerAnlegen } from './anschlussnutzerApi';

/**
 * Hook für `operationId: anschlussnutzerAnlegen` (`POST
 * /stammdaten/anschlussnutzer`, `Idempotency-Key`-Pflicht-Header,
 * synthetic-only D10). Invalidiert nach Erfolg die Anschlussnutzer-Liste.
 */
export const useAnschlussnutzerAnlegen = createAnlegenMutation<AnschlussnutzerAnlegen, AnschlussnutzerDetail>({
  queryKeys: anschlussnutzerKeys,
  anlegen: postAnschlussnutzerAnlegen,
});
