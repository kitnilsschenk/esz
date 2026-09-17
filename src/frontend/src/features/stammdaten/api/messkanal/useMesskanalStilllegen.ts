import type { MesskanalDetail } from '@edms/shared';
import { createStilllegenMutation } from '../shared';
import { messkanalKeys } from './messkanalKeys';
import { deleteMesskanalStilllegen } from './messkanalApi';

/**
 * Hook für `operationId: messkanalStilllegen` (`DELETE
 * /stammdaten/messkanaele/{messkanalId}`, IDEMPOTENT — kein Hard-Delete).
 */
export const useMesskanalStilllegen = createStilllegenMutation<MesskanalDetail>({
  queryKeys: messkanalKeys,
  stilllegen: deleteMesskanalStilllegen,
});
