import type { EndkundeAendern, EndkundeDetail } from '@edms/shared';
import { createAendernMutation } from '../shared';
import { endkundeKeys } from './endkundeKeys';
import { patchEndkundeAendern } from './endkundeApi';

/** Hook für `operationId: endkundeAendern` (`PATCH /stammdaten/endkunden/{endkundeId}`). */
export const useEndkundeAendern = createAendernMutation<EndkundeAendern, EndkundeDetail>({
  queryKeys: endkundeKeys,
  aendern: patchEndkundeAendern,
});
