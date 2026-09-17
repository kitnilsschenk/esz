import type { SystemAendern, SystemDetail } from '@edms/shared';
import { createAendernMutation } from '../shared';
import { systemKeys } from './systemKeys';
import { patchSystemAendern } from './systemApi';

/** Hook für `operationId: systemAendern` (`PATCH /stammdaten/systeme/{systemId}`). */
export const useSystemAendern = createAendernMutation<SystemAendern, SystemDetail>({
  queryKeys: systemKeys,
  aendern: patchSystemAendern,
});
