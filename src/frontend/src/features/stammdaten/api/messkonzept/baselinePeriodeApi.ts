// Einzige Stelle, die fuer die Baseline-Perioden `apiClient.*` aufruft
// (`.claude/rules/frontend-react.md`).

import { apiClient, toApiProblemError, type BaselinePerioden, type BaselinePeriodeSetzen } from '@edms/shared';
import { createIdempotencyKey } from '../shared';

/** `GET /stammdaten/messkonzept-energietraeger/{mvetId}/baseline-perioden` */
export async function fetchBaselinePerioden(mvetId: string): Promise<BaselinePerioden> {
  const { data, error } = await apiClient.GET('/stammdaten/messkonzept-energietraeger/{mvetId}/baseline-perioden', {
    params: { path: { mvetId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `PUT …/baseline-perioden` — die ganze Menge, idempotent. */
export async function setzeBaselinePerioden(
  mvetId: string,
  perioden: readonly BaselinePeriodeSetzen[],
): Promise<BaselinePerioden> {
  const { data, error } = await apiClient.PUT('/stammdaten/messkonzept-energietraeger/{mvetId}/baseline-perioden', {
    params: { path: { mvetId }, header: { 'Idempotency-Key': createIdempotencyKey() } },
    body: { perioden: [...perioden] },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
