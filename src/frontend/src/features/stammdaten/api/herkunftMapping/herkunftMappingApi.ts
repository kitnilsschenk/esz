// Einzige Stelle, die für die Herkunfts-Zuordnung `apiClient.*` aufruft
// (`.claude/rules/frontend-react.md`).

import {
  apiClient,
  toApiProblemError,
  type HerkunftMapping,
  type HerkunftMappingAnlegen,
} from '@edms/shared';

/** `GET /monitoring/ingest/herkunft` — alle Zuordnungen, neueste zuerst. */
export async function fetchHerkunftMappingListe(): Promise<readonly HerkunftMapping[]> {
  const { data, error } = await apiClient.GET('/monitoring/ingest/herkunft', {});
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /monitoring/ingest/herkunft` */
export async function anlegenHerkunftMapping(
  input: HerkunftMappingAnlegen,
  idempotencyKey: string,
): Promise<HerkunftMapping> {
  const { data, error } = await apiClient.POST('/monitoring/ingest/herkunft', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `DELETE /monitoring/ingest/herkunft/{herkunftId}` — antwortet mit der
 * ENTFERNTEN Zeile, nicht mit `204`: Der Audit-Kontext auf Serverseite
 * braucht die Kennungen einer Zeile, die es danach nicht mehr gibt.
 */
export async function entfernenHerkunftMapping(id: string, idempotencyKey: string): Promise<HerkunftMapping> {
  const { data, error } = await apiClient.DELETE('/monitoring/ingest/herkunft/{herkunftId}', {
    params: { path: { herkunftId: id }, header: { 'Idempotency-Key': idempotencyKey } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
