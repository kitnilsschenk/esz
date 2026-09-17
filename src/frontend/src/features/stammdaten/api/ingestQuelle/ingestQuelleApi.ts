// Einzige Stelle, die für die Datenquellen-Verwaltung `apiClient` aufruft
// (`.claude/rules/frontend-react.md`).
//
// **Was hier NICHT vorkommt:** ein Weg, ein hinterlegtes Geheimnis zu lesen.
// Den gibt es serverseitig nicht, und es soll auch clientseitig keine Stelle
// geben, an der jemand danach sucht.

import {
  apiClient,
  toApiProblemError,
  type IngestQuelleAendern,
  type IngestQuelleAnlegen,
  type IngestQuelleKonfig,
} from '@edms/shared';

/** `GET /monitoring/ingest/quellen` — alle gepflegten Datenquellen, ohne Geheimnisse. */
export async function fetchIngestQuellen(): Promise<readonly IngestQuelleKonfig[]> {
  const { data, error } = await apiClient.GET('/monitoring/ingest/quellen', {});
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /monitoring/ingest/quellen` */
export async function postIngestQuelle(
  body: IngestQuelleAnlegen,
  idempotencyKey: string,
): Promise<IngestQuelleKonfig> {
  const { data, error } = await apiClient.POST('/monitoring/ingest/quellen', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `PATCH /monitoring/ingest/quellen/{quelleId}` */
export async function patchIngestQuelle(
  quelleId: string,
  body: IngestQuelleAendern,
  idempotencyKey: string,
): Promise<IngestQuelleKonfig> {
  const { data, error } = await apiClient.PATCH('/monitoring/ingest/quellen/{quelleId}', {
    params: { path: { quelleId }, header: { 'Idempotency-Key': idempotencyKey } },
    body,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
