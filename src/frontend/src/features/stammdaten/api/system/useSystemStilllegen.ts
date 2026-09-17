import type { SystemDetail } from '@edms/shared';
import { createStilllegenMutation } from '../shared';
import { systemKeys } from './systemKeys';
import { deleteSystemStilllegen } from './systemApi';

/**
 * Hook für `operationId: systemStilllegen` (`DELETE
 * /stammdaten/systeme/{systemId}`, `status=stillgelegt`, IDEMPOTENT — kein
 * Hard-Delete, ADR-0004 §14).
 */
export const useSystemStilllegen = createStilllegenMutation<SystemDetail>({
  queryKeys: systemKeys,
  stilllegen: deleteSystemStilllegen,
});
