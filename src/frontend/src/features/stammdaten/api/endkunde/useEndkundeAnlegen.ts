import type { EndkundeAnlegen, EndkundeDetail } from '@edms/shared';
import { createAnlegenMutation } from '../shared';
import { endkundeKeys } from './endkundeKeys';
import { postEndkundeAnlegen } from './endkundeApi';

/**
 * Hook für `operationId: endkundeAnlegen` (`POST /stammdaten/endkunden`,
 * `Idempotency-Key`-Pflicht-Header, synthetic-only D10). Invalidiert nach
 * Erfolg die Endkunden-Liste (neuer Eintrag ohne manuellen Refresh).
 */
export const useEndkundeAnlegen = createAnlegenMutation<EndkundeAnlegen, EndkundeDetail>({
  queryKeys: endkundeKeys,
  anlegen: postEndkundeAnlegen,
});
