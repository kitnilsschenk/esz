// Einzige Stelle, die für die Messkanal-Ressource (inkl. Sub-Ressource
// `/stammdaten/zaehler/{zaehlerId}/messkanaele`) `apiClient.GET/POST/PATCH/
// DELETE(...)` aufruft (`.claude/rules/frontend-react.md`). Jede Funktion
// hier mappt Fehler sofort über `toApiProblemError` (analog `zaehlerApi.ts`).

import {
  apiClient,
  toApiProblemError,
  type MesskanalAendern,
  type MesskanalAnlegen,
  type MesskanalDetail,
  type MesskanalListe,
} from '@edms/shared';
import type { CursorParams } from '../shared';

// `zaehlerId` ist beim Listen-Endpunkt ein PFAD-Parameter (Sub-Ressource
// `/stammdaten/zaehler/{zaehlerId}/messkanaele`, KEIN Query-Filter wie bei
// System/Zähler) — hier trotzdem Teil des Filter-Objekts, damit derselbe
// `createListeQuery`-Fabrik-Aufruf wie bei den anderen Entitäten funktioniert
// (`fetchMesskanaeleSeite` liest `zaehlerId` heraus und baut daraus den Pfad).
export interface MesskanaeleListenFilter {
  readonly [key: string]: string | number | boolean | undefined;
  readonly zaehlerId: string;
}

export async function fetchMesskanaeleSeite(params: CursorParams & MesskanaeleListenFilter): Promise<MesskanalListe> {
  const { data, error } = await apiClient.GET('/stammdaten/zaehler/{zaehlerId}/messkanaele', {
    params: {
      path: { zaehlerId: params.zaehlerId },
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

export async function fetchMesskanalDetail(messkanalId: string): Promise<MesskanalDetail> {
  const { data, error } = await apiClient.GET('/stammdaten/messkanaele/{messkanalId}', {
    params: { path: { messkanalId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `zaehlerId` ist Teil des Eingabe-Objekts (nicht ein zweiter Funktions-
 * parameter) — so passt `postMesskanalAnlegen` unverändert in die geteilte
 * `createAnlegenMutation`-Fabrik (`anlegen: (input, idempotencyKey) => …`,
 * EIN Eingabe-Parameter).
 */
export interface MesskanalAnlegenInput extends MesskanalAnlegen {
  readonly zaehlerId: string;
}

export async function postMesskanalAnlegen(input: MesskanalAnlegenInput, idempotencyKey: string): Promise<MesskanalDetail> {
  const { zaehlerId, ...body } = input;
  const { data, error } = await apiClient.POST('/stammdaten/zaehler/{zaehlerId}/messkanaele', {
    params: { path: { zaehlerId }, header: { 'Idempotency-Key': idempotencyKey } },
    body,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export async function patchMesskanalAendern(
  messkanalId: string,
  input: MesskanalAendern,
  idempotencyKey: string,
): Promise<MesskanalDetail> {
  const { data, error } = await apiClient.PATCH('/stammdaten/messkanaele/{messkanalId}', {
    params: { path: { messkanalId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** IDEMPOTENT — Stilllegung (kein Hard-Delete, Linie 3). */
export async function deleteMesskanalStilllegen(messkanalId: string, idempotencyKey: string): Promise<MesskanalDetail> {
  const { data, error } = await apiClient.DELETE('/stammdaten/messkanaele/{messkanalId}', {
    params: { path: { messkanalId }, header: { 'Idempotency-Key': idempotencyKey } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
