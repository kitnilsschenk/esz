// Einzige Stelle, die für die Preflight-Ressource `apiClient.GET/POST(...)`
// aufruft (`.claude/rules/frontend-react.md`). APPEND-ONLY: jeder Aufruf von
// `POST /nachweis/preflights` erzeugt einen NEUEN, eigenständigen Datensatz
// (wiederholbar — „idempotent" heißt hier fachlich „gleiche Eingabe, gleiches
// Ergebnis", NICHT „kein zweiter Lauf", ADR-0007 D4).

import {
  apiClient,
  toApiProblemError,
  type Preflight,
  type PreflightBefundListe,
  type PreflightMitBefunden,
} from '@edms/shared';
import type { CursorParams } from '../../stammdaten/api/shared';

/**
 * `profilCode` ist serverseitig fail-closed auf GENAU EINEN Katalog-Eintrag
 * beschränkt (`PreflightAusfuehrenDto` → `PREFLIGHT_PROFIL_CODE`, V0024) —
 * die Oberfläche bietet deshalb KEINE Auswahl an, sondern setzt den Wert.
 * Wird der Katalog erweitert, wird daraus ein Auswahlfeld; bis dahin wäre
 * eine Ein-Element-Auswahl nur eine Attrappe.
 */
export const PREFLIGHT_PROFIL_CODE = 'foerderjahr_preflight_de02';

export interface PreflightAusfuehrenInput {
  readonly foerderjahrId: string;
}

/** `POST /nachweis/preflights` (`create:nachweis_preflight`, Rolle `betrieb`) — Kopf + ALLE Befunde. */
export async function postPreflightAusfuehren(
  input: PreflightAusfuehrenInput,
  idempotencyKey: string,
): Promise<PreflightMitBefunden> {
  const { data, error } = await apiClient.POST('/nachweis/preflights', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: { foerderjahrId: input.foerderjahrId, profilCode: PREFLIGHT_PROFIL_CODE },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /nachweis/preflights/{preflightId}` — nur der Kopf (Ampel + Zähler). */
export async function fetchPreflightDetail(preflightId: string): Promise<Preflight> {
  const { data, error } = await apiClient.GET('/nachweis/preflights/{preflightId}', {
    params: { path: { preflightId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

// `preflightId` ist ein PFAD-Parameter (Sub-Ressource, KEIN Query-Filter) —
// hier trotzdem Teil des Filter-Objekts, damit derselbe `createListeQuery`-
// Fabrik-Aufruf wie bei den anderen Listen funktioniert (analog
// `BerechnungslaufListenFilter`).
export interface PreflightBefundeListenFilter {
  readonly [key: string]: string | number | boolean | undefined;
  readonly preflightId: string;
}

/** `GET /nachweis/preflights/{preflightId}/befunde` — Cursor-paginiert, PII- und wertfrei (A15). */
export async function fetchPreflightBefundeSeite(
  params: CursorParams & PreflightBefundeListenFilter,
): Promise<PreflightBefundListe> {
  const { data, error } = await apiClient.GET('/nachweis/preflights/{preflightId}/befunde', {
    params: {
      path: { preflightId: params.preflightId },
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
