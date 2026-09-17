import type { NutzungsverhaeltnisBeenden, NutzungsverhaeltnisDetail } from '@edms/shared';
import { createAendernMutation } from '../shared';
import { nutzungsverhaeltnisKeys } from './nutzungsverhaeltnisKeys';
import { patchNutzungsverhaeltnisBeenden } from './nutzungsverhaeltnisApi';

/**
 * Hook für `operationId: nutzungsverhaeltnisBeenden` (`PATCH
 * /stammdaten/nutzungsverhaeltnisse/{id}`, `gueltigBis`-Body). Nutzt bewusst
 * die geteilte `createAendernMutation`-Fabrik (identische PATCH-id+body-Form
 * wie ein reguläres „Ändern" — `api/shared/createAendernMutation.ts`s
 * Doku-Kommentar sieht diese Wiederverwendung explizit vor).
 */
export const useNutzungsverhaeltnisBeenden = createAendernMutation<NutzungsverhaeltnisBeenden, NutzungsverhaeltnisDetail>({
  queryKeys: nutzungsverhaeltnisKeys,
  aendern: patchNutzungsverhaeltnisBeenden,
});
