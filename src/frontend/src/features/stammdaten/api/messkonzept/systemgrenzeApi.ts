// Einzige Stelle, die fuer die Systemgrenze `apiClient.*` aufruft
// (`.claude/rules/frontend-react.md`).

import { apiClient, toApiProblemError, type Systemgrenze } from '@edms/shared';
import { createIdempotencyKey } from '../shared';

/** `GET /stammdaten/messkonzept-energietraeger/{mvetId}/systeme` */
export async function fetchSystemgrenze(mvetId: string): Promise<Systemgrenze> {
  const { data, error } = await apiClient.GET('/stammdaten/messkonzept-energietraeger/{mvetId}/systeme', {
    params: { path: { mvetId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `PUT …/systeme` — die ganze Menge, idempotent. */
export async function setzeSystemgrenze(mvetId: string, systemIds: readonly string[]): Promise<Systemgrenze> {
  const { data, error } = await apiClient.PUT('/stammdaten/messkonzept-energietraeger/{mvetId}/systeme', {
    params: { path: { mvetId }, header: { 'Idempotency-Key': createIdempotencyKey() } },
    body: { systemIds: [...systemIds] },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
