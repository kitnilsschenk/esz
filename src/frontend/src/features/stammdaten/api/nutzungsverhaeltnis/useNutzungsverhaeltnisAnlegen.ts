import type { NutzungsverhaeltnisAnlegen, NutzungsverhaeltnisDetail } from '@edms/shared';
import { createAnlegenMutation } from '../shared';
import { nutzungsverhaeltnisKeys } from './nutzungsverhaeltnisKeys';
import { postNutzungsverhaeltnisAnlegen } from './nutzungsverhaeltnisApi';

/** Hook für `operationId: nutzungsverhaeltnisAnlegen` (`POST /stammdaten/nutzungsverhaeltnisse`). */
export const useNutzungsverhaeltnisAnlegen = createAnlegenMutation<NutzungsverhaeltnisAnlegen, NutzungsverhaeltnisDetail>({
  queryKeys: nutzungsverhaeltnisKeys,
  anlegen: postNutzungsverhaeltnisAnlegen,
});
