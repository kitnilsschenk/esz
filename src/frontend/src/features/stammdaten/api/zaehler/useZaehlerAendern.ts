import type { ZaehlerAendern, ZaehlerDetail } from '@edms/shared';
import { createAendernMutation } from '../shared';
import { zaehlerKeys } from './zaehlerKeys';
import { patchZaehlerAendern } from './zaehlerApi';

/** Hook für `operationId: zaehlerAendern` (`PATCH /stammdaten/zaehler/{zaehlerId}`). */
export const useZaehlerAendern = createAendernMutation<ZaehlerAendern, ZaehlerDetail>({
  queryKeys: zaehlerKeys,
  aendern: patchZaehlerAendern,
});
