import type { MesskanalAendern, MesskanalDetail } from '@edms/shared';
import { createAendernMutation } from '../shared';
import { messkanalKeys } from './messkanalKeys';
import { patchMesskanalAendern } from './messkanalApi';

/** Hook für `operationId: messkanalAendern` (`PATCH /stammdaten/messkanaele/{messkanalId}`). */
export const useMesskanalAendern = createAendernMutation<MesskanalAendern, MesskanalDetail>({
  queryKeys: messkanalKeys,
  aendern: patchMesskanalAendern,
});
