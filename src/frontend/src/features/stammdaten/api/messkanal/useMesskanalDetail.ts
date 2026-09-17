import type { MesskanalDetail } from '@edms/shared';
import { createDetailQuery } from '../shared';
import { messkanalKeys } from './messkanalKeys';
import { fetchMesskanalDetail } from './messkanalApi';

/** Hook für `operationId: messkanalLesen` (`GET /stammdaten/messkanaele/{id}`). */
export const useMesskanalDetail = createDetailQuery<MesskanalDetail>({
  queryKeys: messkanalKeys,
  fetchDetail: fetchMesskanalDetail,
});
