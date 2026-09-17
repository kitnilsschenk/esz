import type { NutzungsverhaeltnisDetail } from '@edms/shared';
import { createDetailQuery } from '../shared';
import { nutzungsverhaeltnisKeys } from './nutzungsverhaeltnisKeys';
import { fetchNutzungsverhaeltnisDetail } from './nutzungsverhaeltnisApi';

/** Hook für `operationId: nutzungsverhaeltnisLesen` (`GET /stammdaten/nutzungsverhaeltnisse/{id}`). */
export const useNutzungsverhaeltnisDetail = createDetailQuery<NutzungsverhaeltnisDetail>({
  queryKeys: nutzungsverhaeltnisKeys,
  fetchDetail: fetchNutzungsverhaeltnisDetail,
});
