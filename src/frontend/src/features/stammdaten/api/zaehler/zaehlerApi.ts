// Einzige Stelle, die für die Zähler-Ressource `apiClient.GET/POST/PATCH/
// DELETE(...)` aufruft (`.claude/rules/frontend-react.md`: „API-Calls
// ausschließlich über den generierten OpenAPI-Client in src/shared/api/").
// Jede Funktion hier mappt Fehler sofort über `toApiProblemError` (analog
// `systemApi.ts`).

import {
  apiClient,
  toApiProblemError,
  type MesskanalFreshnessItem,
  type ZaehlerAendern,
  type ZaehlerAnlegen,
  type ZaehlerDetail,
  type ZaehlerListe,
} from '@edms/shared';
import type { CursorParams } from '../shared';

// Index-Signatur zwingend (strukturelle Kompatibilität mit `ListenFilter`,
// analog `SystemeListenFilter`).
export interface ZaehlerListenFilter {
  readonly [key: string]: string | number | boolean | undefined;
  readonly systemId?: string;
}

export async function fetchZaehlerSeite(params: CursorParams & ZaehlerListenFilter): Promise<ZaehlerListe> {
  const { data, error } = await apiClient.GET('/stammdaten/zaehler', {
    params: {
      query: {
        ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
        ...(params.systemId !== undefined ? { systemId: params.systemId } : {}),
      },
    },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export async function fetchZaehlerDetail(zaehlerId: string): Promise<ZaehlerDetail> {
  const { data, error } = await apiClient.GET('/stammdaten/zaehler/{zaehlerId}', {
    params: { path: { zaehlerId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export async function postZaehlerAnlegen(input: ZaehlerAnlegen, idempotencyKey: string): Promise<ZaehlerDetail> {
  const { data, error } = await apiClient.POST('/stammdaten/zaehler', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export async function patchZaehlerAendern(zaehlerId: string, input: ZaehlerAendern, idempotencyKey: string): Promise<ZaehlerDetail> {
  const { data, error } = await apiClient.PATCH('/stammdaten/zaehler/{zaehlerId}', {
    params: { path: { zaehlerId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** IDEMPOTENT — Stilllegung (`status=stillgelegt`, kein Hard-Delete, ADR-0004 §14). */
export async function deleteZaehlerStilllegen(zaehlerId: string, idempotencyKey: string): Promise<ZaehlerDetail> {
  const { data, error } = await apiClient.DELETE('/stammdaten/zaehler/{zaehlerId}', {
    params: { path: { zaehlerId }, header: { 'Idempotency-Key': idempotencyKey } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `read:monitoring` — Freshness je Messkanal (`GET .../zaehler/{id}/freshness`,
 * Betriebs-Metadatum, KEIN break-glass, Betriebs-UI-Konzept Punkt 3). Liefert
 * ALLE Messkanäle unabhängig vom Status; `letzteUebertragung: null` = noch
 * nie empfangen (Empty-State, kein Fehler).
 */
export async function fetchZaehlerFreshness(zaehlerId: string): Promise<MesskanalFreshnessItem[]> {
  const { data, error } = await apiClient.GET('/stammdaten/zaehler/{zaehlerId}/freshness', {
    params: { path: { zaehlerId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
