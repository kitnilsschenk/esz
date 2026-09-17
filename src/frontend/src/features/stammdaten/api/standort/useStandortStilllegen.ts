import type { StandortStilllegen, StandortStillgelegtErgebnis } from '@edms/shared';
import { createAendernMutation } from '../shared';
import { standortKeys } from './standortKeys';
import { postStandortStilllegen } from './standortApi';

/**
 * Hook für `operationId: standortStilllegen` (`POST
 * .../standorte/{id}/stilllegen`, Body `{grund}` — D2.6, IDEMPOTENT, KEIN
 * Hard-Delete). Über `createAendernMutation` (identische `id`+`input`-Form,
 * unabhängig vom HTTP-Verb POST statt PATCH — analog `useStandortPiiAendern`).
 */
export const useStandortStilllegen = createAendernMutation<StandortStilllegen, StandortStillgelegtErgebnis>({
  queryKeys: standortKeys,
  aendern: postStandortStilllegen,
});
