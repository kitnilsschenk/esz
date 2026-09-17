import type { ZaehlerDetail } from '@edms/shared';
import { createDetailQuery } from '../shared';
import { zaehlerKeys } from './zaehlerKeys';
import { fetchZaehlerDetail } from './zaehlerApi';

/** Hook für `operationId: zaehlerLesen` (`GET /stammdaten/zaehler/{id}`). */
export const useZaehlerDetail = createDetailQuery<ZaehlerDetail>({
  queryKeys: zaehlerKeys,
  fetchDetail: fetchZaehlerDetail,
});
