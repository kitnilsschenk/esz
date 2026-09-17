// Einzige Stelle, die für die Anschlussnutzer-Ressource
// `apiClient.GET/POST(...)` aufruft (`.claude/rules/frontend-react.md`).
// Jede Funktion hier mappt Fehler sofort über `toApiProblemError` (analog
// `endkundeApi.ts` — Anschlussnutzer ist eine PII-Entität, Muster = Endkunde,
// ADR-0008 §23 / D11 Phase 4c Pass 2).

import {
  apiClient,
  toApiProblemError,
  type EinschraenkungUnterrichtung,
  type AnschlussnutzerAnlegen,
  type AnschlussnutzerDetail,
  type AnschlussnutzerListe,
  type AnschlussnutzerSperren,
} from '@edms/shared';
import type { CursorParams } from '../shared';

// Index-Signatur zwingend (strukturelle Kompatibilität mit `ListenFilter` aus
// `api/shared/resourceQueryKeys.ts`, analog `SystemeListenFilter`).
export interface AnschlussnutzerListenFilter {
  readonly [key: string]: string | number | boolean | undefined;
  readonly endkundeId?: string;
}

export async function fetchAnschlussnutzerSeite(
  params: CursorParams & AnschlussnutzerListenFilter,
): Promise<AnschlussnutzerListe> {
  const { data, error } = await apiClient.GET('/stammdaten/anschlussnutzer', {
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

export async function fetchAnschlussnutzerDetail(anschlussnutzerId: string): Promise<AnschlussnutzerDetail> {
  const { data, error } = await apiClient.GET('/stammdaten/anschlussnutzer/{anschlussnutzerId}', {
    params: { path: { anschlussnutzerId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export async function postAnschlussnutzerAnlegen(
  input: AnschlussnutzerAnlegen,
  idempotencyKey: string,
): Promise<AnschlussnutzerDetail> {
  const { data, error } = await apiClient.POST('/stammdaten/anschlussnutzer', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * Art.-18-Sperre des Anschlussnutzers (ADR-0007 A11.6) — Aktions-Route mit
 * Pflicht-Grund, semantisch identisch zu `postEndkundeSperren`.
 *
 * Der Anschlussnutzer ist eine EIGENE betroffene Person: seine Einschraenkung
 * wirkt unabhaengig von der des Endkunden.
 */
export async function postAnschlussnutzerSperren(
  anschlussnutzerId: string,
  input: AnschlussnutzerSperren,
  idempotencyKey: string,
): Promise<AnschlussnutzerDetail> {
  const { data, error } = await apiClient.POST('/stammdaten/anschlussnutzer/{anschlussnutzerId}/sperren', {
    params: { path: { anschlussnutzerId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * Art. 18 Abs. 3 DSGVO — Unterrichtung dokumentieren (Schritt 1 von 2,
 * ADR-0007 A11.10). Ohne diesen Schritt lehnt der Server die Aufhebung ab.
 */
export async function postAnschlussnutzerUnterrichtung(
  anschlussnutzerId: string,
  input: EinschraenkungUnterrichtung,
  idempotencyKey: string,
): Promise<AnschlussnutzerDetail> {
  const { data, error } = await apiClient.POST('/stammdaten/anschlussnutzer/{anschlussnutzerId}/einschraenkung-unterrichtung', {
    params: { path: { anschlussnutzerId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** Aufhebung der Einschränkung (Schritt 2). Fail-closed ohne Schritt 1. */
export async function postAnschlussnutzerEntsperren(anschlussnutzerId: string, idempotencyKey: string): Promise<AnschlussnutzerDetail> {
  const { data, error } = await apiClient.POST('/stammdaten/anschlussnutzer/{anschlussnutzerId}/entsperren', {
    params: { path: { anschlussnutzerId }, header: { 'Idempotency-Key': idempotencyKey } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
