// Einzige Stelle, die für die Art.-19-Ressource `apiClient` aufruft
// (`.claude/rules/frontend-react.md`).

import {
  apiClient,
  toApiProblemError,
  type Art19MitteilungAnlegen,
  type Art19PflichtReport,
} from '@edms/shared';

/** Offene und erfüllte Mitteilungspflichten nach Art. 19 DSGVO (ADR-0007 A18/A11.12). */
export async function getArt19Pflichten(): Promise<Art19PflichtReport> {
  const { data, error } = await apiClient.GET('/nachweis/art19-pflichten', {});
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * Dokumentiert eine erfolgte Mitteilung. Antwort ist der aktualisierte
 * Report — der Server ist die einzige Instanz, die weiß, welche Pflichten
 * danach noch offen sind.
 */
export async function postArt19Mitteilung(
  input: Art19MitteilungAnlegen,
  idempotencyKey: string,
): Promise<Art19PflichtReport> {
  const { data, error } = await apiClient.POST('/nachweis/art19-pflichten/mitteilungen', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
