import type { ZaehlerAnlegen, ZaehlerDetail } from '@edms/shared';
import { createAnlegenMutation } from '../shared';
import { zaehlerKeys } from './zaehlerKeys';
import { postZaehlerAnlegen } from './zaehlerApi';

/** Hook für `operationId: zaehlerAnlegen` (`POST /stammdaten/zaehler`). */
export const useZaehlerAnlegen = createAnlegenMutation<ZaehlerAnlegen, ZaehlerDetail>({
  queryKeys: zaehlerKeys,
  anlegen: postZaehlerAnlegen,
});
