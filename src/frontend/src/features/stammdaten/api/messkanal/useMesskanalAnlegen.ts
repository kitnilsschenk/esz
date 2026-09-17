import type { MesskanalDetail } from '@edms/shared';
import { createAnlegenMutation } from '../shared';
import { messkanalKeys } from './messkanalKeys';
import { postMesskanalAnlegen, type MesskanalAnlegenInput } from './messkanalApi';

/**
 * Hook für `operationId: messkanalAnlegen` (`POST
 * /stammdaten/zaehler/{zaehlerId}/messkanaele`). `zaehlerId` ist Teil des
 * Eingabe-Objekts (`MesskanalAnlegenInput`, siehe `messkanalApi.ts`).
 */
export const useMesskanalAnlegen = createAnlegenMutation<MesskanalAnlegenInput, MesskanalDetail>({
  queryKeys: messkanalKeys,
  anlegen: postMesskanalAnlegen,
});
