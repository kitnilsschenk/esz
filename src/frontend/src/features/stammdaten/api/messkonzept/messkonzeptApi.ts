// Einzige Stelle, die für die Messkonzept-Ressource (Sub-Ressource
// `/stammdaten/endkunden/{endkundeId}/messkonzept/versionen`)
// `apiClient.GET/POST(...)` aufruft (`.claude/rules/frontend-react.md`).
// APPEND-ONLY (Linie 3): es gibt bewusst KEIN PATCH/DELETE hier — der
// Backend-Controller (`messkonzept.controller.ts`) bietet nur `liste`,
// `anlegen`, `lesen` (analog `messkanalApi.ts`s Sub-Ressourcen-Teil).

import {
  apiClient,
  toApiProblemError,
  type MesskonzeptVersionAnlegen,
  type MesskonzeptVersionDetail,
  type MesskonzeptVersionListe,
} from '@edms/shared';
import type { CursorParams } from '../shared';

// `endkundeId` ist ein PFAD-Parameter (Sub-Ressource, KEIN Query-Filter) —
// hier trotzdem Teil des Filter-Objekts, damit derselbe
// `createListeQuery`-Fabrik-Aufruf wie bei den anderen Entitäten funktioniert
// (analog `MesskanaeleListenFilter`).
export interface MesskonzeptVersionenListenFilter {
  readonly [key: string]: string | number | boolean | undefined;
  readonly endkundeId: string;
}

export async function fetchMesskonzeptVersionenSeite(
  params: CursorParams & MesskonzeptVersionenListenFilter,
): Promise<MesskonzeptVersionListe> {
  const { data, error } = await apiClient.GET('/stammdaten/endkunden/{endkundeId}/messkonzept/versionen', {
    params: {
      path: { endkundeId: params.endkundeId },
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

/** Zusammengesetzter Schlüssel — `versionNr` ist NUR innerhalb eines Endkunden eindeutig (kein globaler Index). */
export interface MesskonzeptVersionRef {
  readonly endkundeId: string;
  readonly versionNr: number;
}

/**
 * Kodiert `{endkundeId, versionNr}` als einzelnen String-Schlüssel — die
 * geteilte `createDetailQuery`-Fabrik (`api/shared/createDetailQuery.ts`)
 * erwartet einen einzelnen `id: string`-Parameter; dieser Baustein bleibt so
 * UNVERÄNDERT (kein zusammengesetzter Detail-Query-Typ nötig).
 */
export function encodeMesskonzeptVersionId(ref: MesskonzeptVersionRef): string {
  return `${ref.endkundeId}:${String(ref.versionNr)}`;
}

function decodeMesskonzeptVersionId(id: string): MesskonzeptVersionRef {
  const [endkundeId = '', versionNrRaw = ''] = id.split(':');
  return { endkundeId, versionNr: Number(versionNrRaw) };
}

export async function fetchMesskonzeptVersionDetail(id: string): Promise<MesskonzeptVersionDetail> {
  const { endkundeId, versionNr } = decodeMesskonzeptVersionId(id);
  const { data, error } = await apiClient.GET('/stammdaten/endkunden/{endkundeId}/messkonzept/versionen/{versionNr}', {
    params: { path: { endkundeId, versionNr } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `endkundeId` ist Teil des Eingabe-Objekts (nicht ein zweiter Funktions-
 * parameter) — so passt `postMesskonzeptVersionAnlegen` unverändert in die
 * geteilte `createAnlegenMutation`-Fabrik (analog `MesskanalAnlegenInput`).
 */
export interface MesskonzeptVersionAnlegenInput extends MesskonzeptVersionAnlegen {
  readonly endkundeId: string;
}

export async function postMesskonzeptVersionAnlegen(
  input: MesskonzeptVersionAnlegenInput,
  idempotencyKey: string,
): Promise<MesskonzeptVersionDetail> {
  const { endkundeId, ...body } = input;
  const { data, error } = await apiClient.POST('/stammdaten/endkunden/{endkundeId}/messkonzept/versionen', {
    params: { path: { endkundeId }, header: { 'Idempotency-Key': idempotencyKey } },
    body,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
