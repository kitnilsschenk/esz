import type { SystemDetail } from '@edms/shared';
import { createDetailQuery } from '../shared';
import { systemKeys } from './systemKeys';
import { fetchSystemDetail } from './systemApi';

/** Hook für `operationId: systemLesen` (`GET /stammdaten/systeme/{id}`). */
export const useSystemDetail = createDetailQuery<SystemDetail>({
  queryKeys: systemKeys,
  fetchDetail: fetchSystemDetail,
});
