import type { SystemAnlegen, SystemDetail } from '@edms/shared';
import { createAnlegenMutation } from '../shared';
import { systemKeys } from './systemKeys';
import { postSystemAnlegen } from './systemApi';

/** Hook für `operationId: systemAnlegen` (`POST /stammdaten/systeme`). */
export const useSystemAnlegen = createAnlegenMutation<SystemAnlegen, SystemDetail>({
  queryKeys: systemKeys,
  anlegen: postSystemAnlegen,
});
