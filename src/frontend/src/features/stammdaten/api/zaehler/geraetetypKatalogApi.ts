// Einzige Stelle, die den Gerätetyp-Katalog abruft
// (`.claude/rules/frontend-react.md`).

import { apiClient, toApiProblemError, type GeraetetypKatalog } from '@edms/shared';

/**
 * `GET /stammdaten/geraetetypen` — welche Gerätetypen ausgewertet werden
 * können und welche Messkanäle sie liefern.
 *
 * Keine Pagination: Der Katalog kommt aus dem Code, nicht aus der Datenbank.
 */
export async function fetchGeraetetypKatalog(): Promise<GeraetetypKatalog> {
  const { data, error } = await apiClient.GET('/stammdaten/geraetetypen', {});
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
