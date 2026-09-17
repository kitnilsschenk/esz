import type { ZaehlerDetail } from '@edms/shared';
import { createStilllegenMutation } from '../shared';
import { zaehlerKeys } from './zaehlerKeys';
import { deleteZaehlerStilllegen } from './zaehlerApi';

/**
 * Hook für `operationId: zaehlerStilllegen` (`DELETE
 * /stammdaten/zaehler/{zaehlerId}`, `status=stillgelegt`, IDEMPOTENT — kein
 * Hard-Delete, ADR-0004 §14).
 */
export const useZaehlerStilllegen = createStilllegenMutation<ZaehlerDetail>({
  queryKeys: zaehlerKeys,
  stilllegen: deleteZaehlerStilllegen,
});
