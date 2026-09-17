// Einzige Stelle, die für die Förderjahr-Ressource `apiClient.GET/POST(...)`
// aufruft (`.claude/rules/frontend-react.md`). APPEND-ONLY: der Controller
// (`src/backend/src/nachweis/foerderjahr.controller.ts`) bietet nur `anlegen`
// (Rolle `betrieb`), `liste` und `lesen` (Rollen `betrieb`/
// `compliance-auditor`) — es gibt bewusst KEIN PATCH/DELETE.

import {
  apiClient,
  toApiProblemError,
  type Foerderjahr,
  type FoerderjahrAnlegen,
  type FoerderjahrListe,
} from '@edms/shared';
import type { CursorParams } from '../../stammdaten/api/shared';

/** `GET /nachweis/foerderjahre` — Cursor-paginiert, keine Filter (portfolioweit, B10). */
export async function fetchFoerderjahreSeite(params: CursorParams): Promise<FoerderjahrListe> {
  const { data, error } = await apiClient.GET('/nachweis/foerderjahre', {
    params: {
      query: {
        ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
      },
    },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /nachweis/foerderjahre/{foerderjahrId}`. */
export async function fetchFoerderjahrDetail(foerderjahrId: string): Promise<Foerderjahr> {
  const { data, error } = await apiClient.GET('/nachweis/foerderjahre/{foerderjahrId}', {
    params: { path: { foerderjahrId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /nachweis/foerderjahre` (`create:foerderjahr`, Rolle `betrieb`). */
export async function postFoerderjahrAnlegen(input: FoerderjahrAnlegen, idempotencyKey: string): Promise<Foerderjahr> {
  const { data, error } = await apiClient.POST('/nachweis/foerderjahre', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
