// Einzige Stelle, die für die Einspar-Lauf-Ressource `apiClient.GET/POST(...)`
// aufruft (`.claude/rules/frontend-react.md`). APPEND-ONLY (weder PATCH noch
// DELETE): eine Neuberechnung ist ein NEUER Lauf, der den alten über
// `ersetztEinsparlaufId` ablöst — der alte bleibt unverändert stehen.

import {
  apiClient,
  toApiProblemError,
  type EinsparlaufAnlegen,
  type EinsparlaufAntwort,
  type EinsparlaufArt,
  type EinsparlaufBindungListe,
  type EinsparlaufErgebnisListe,
  type EinsparlaufListe,
} from '@edms/shared';
import type { CursorParams } from '../../stammdaten/api/shared';

export interface EinsparlaeufeListenFilter {
  readonly [key: string]: string | number | boolean | undefined;
  /** `?foerderjahr=` — filtert auf ein Förderjahr. */
  readonly foerderjahr?: string;
  readonly art?: EinsparlaufArt;
  /** `?nurAktuelle=true` — blendet abgelöste (`ersetztEinsparlaufId`-Vorgänger) Läufe aus. */
  readonly nurAktuelle?: boolean;
}

/** `GET /nachweis/einsparlaeufe` — Cursor-paginiert, portfolioweit (B10). */
export async function fetchEinsparlaeufeSeite(
  params: CursorParams & EinsparlaeufeListenFilter,
): Promise<EinsparlaufListe> {
  const { data, error } = await apiClient.GET('/nachweis/einsparlaeufe', {
    params: {
      query: {
        ...(params.foerderjahr !== undefined ? { foerderjahr: params.foerderjahr } : {}),
        ...(params.art !== undefined ? { art: params.art } : {}),
        ...(params.nurAktuelle !== undefined ? { nurAktuelle: params.nurAktuelle } : {}),
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

/** `GET /nachweis/einsparlaeufe/{einsparlaufId}` — Kopf INKLUSIVE `ergebnisse`-Jahreszeilen. */
export async function fetchEinsparlaufDetail(einsparlaufId: string): Promise<EinsparlaufAntwort> {
  const { data, error } = await apiClient.GET('/nachweis/einsparlaeufe/{einsparlaufId}', {
    params: { path: { einsparlaufId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

// `einsparlaufId` ist ein PFAD-Parameter (Sub-Ressource, KEIN Query-Filter) —
// s. `PreflightBefundeListenFilter`.
export interface EinsparlaufKindListenFilter {
  readonly [key: string]: string | number | boolean | undefined;
  readonly einsparlaufId: string;
}

/** `GET /nachweis/einsparlaeufe/{id}/bindungen` — monatsscharfe Bindung an je einen `analytics.berechnungslauf` (D2). */
export async function fetchEinsparlaufBindungenSeite(
  params: CursorParams & EinsparlaufKindListenFilter,
): Promise<EinsparlaufBindungListe> {
  const { data, error } = await apiClient.GET('/nachweis/einsparlaeufe/{einsparlaufId}/bindungen', {
    params: {
      path: { einsparlaufId: params.einsparlaufId },
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

/**
 * `GET /nachweis/einsparlaeufe/{id}/ergebnisse` — Cursor-paginiert,
 * INKLUSIVE ausgeschlossener Paare (DE-02-Vollständigkeit). Wird zusätzlich
 * zum `ergebnisse`-Feld des Detail-Endpunkts gebraucht: der Detail-Endpunkt
 * liefert die Zeilen ungepaginiert mit, für große Förderjahre ist die
 * paginierte Liste die belastbare Ansicht.
 */
export async function fetchEinsparlaufErgebnisseSeite(
  params: CursorParams & EinsparlaufKindListenFilter,
): Promise<EinsparlaufErgebnisListe> {
  const { data, error } = await apiClient.GET('/nachweis/einsparlaeufe/{einsparlaufId}/ergebnisse', {
    params: {
      path: { einsparlaufId: params.einsparlaufId },
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

/** `POST /nachweis/einsparlaeufe` (`create:einsparlauf`, Rolle `betrieb`) — synchron, EINE Transaktion. */
export async function postEinsparlaufAnlegen(
  input: EinsparlaufAnlegen,
  idempotencyKey: string,
): Promise<EinsparlaufAntwort> {
  const { data, error } = await apiClient.POST('/nachweis/einsparlaeufe', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
