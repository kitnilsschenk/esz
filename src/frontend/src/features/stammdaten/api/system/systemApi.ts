// Einzige Stelle, die für die System-Ressource `apiClient.GET/POST/PATCH(...)`
// aufruft (`.claude/rules/frontend-react.md`: „API-Calls ausschließlich über
// den generierten OpenAPI-Client in src/shared/api/"). Jede Funktion hier
// mappt Fehler sofort über `toApiProblemError` (analog `endkundeApi.ts`).

import { apiClient, toApiProblemError, type SystemAendern, type SystemAnlegen, type SystemDetail, type SystemListe } from '@edms/shared';
import type { CursorParams } from '../shared';

// Index-Signatur zwingend (strukturelle Kompatibilität mit `ListenFilter` aus
// `api/shared/resourceQueryKeys.ts` — `createListeQuery`s generischer
// `TFilter extends ListenFilter`-Constraint verlangt sie).
export interface SystemeListenFilter {
  readonly [key: string]: string | number | boolean | undefined;
  readonly endkundeId?: string;
}

export async function fetchSystemeSeite(params: CursorParams & SystemeListenFilter): Promise<SystemListe> {
  const { data, error } = await apiClient.GET('/stammdaten/systeme', {
    params: {
      query: {
        ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
        ...(params.endkundeId !== undefined ? { endkundeId: params.endkundeId } : {}),
      },
    },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export async function fetchSystemDetail(systemId: string): Promise<SystemDetail> {
  const { data, error } = await apiClient.GET('/stammdaten/systeme/{systemId}', {
    params: { path: { systemId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export async function postSystemAnlegen(input: SystemAnlegen, idempotencyKey: string): Promise<SystemDetail> {
  const { data, error } = await apiClient.POST('/stammdaten/systeme', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export async function patchSystemAendern(systemId: string, input: SystemAendern, idempotencyKey: string): Promise<SystemDetail> {
  const { data, error } = await apiClient.PATCH('/stammdaten/systeme/{systemId}', {
    params: { path: { systemId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** IDEMPOTENT — Stilllegung (`status=stillgelegt`, kein Hard-Delete, ADR-0004 §14). */
export async function deleteSystemStilllegen(systemId: string, idempotencyKey: string): Promise<SystemDetail> {
  const { data, error } = await apiClient.DELETE('/stammdaten/systeme/{systemId}', {
    params: { path: { systemId }, header: { 'Idempotency-Key': idempotencyKey } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
