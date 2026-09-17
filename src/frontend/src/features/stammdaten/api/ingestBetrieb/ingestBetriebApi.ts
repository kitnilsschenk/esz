// Einzige Stelle, die für die Ingest-Betriebssicht `apiClient.GET(...)`
// aufruft (`.claude/rules/frontend-react.md`). Nur lesend — die Aufnahme
// selbst läuft in einem eigenen Prozess und wird von hier aus nicht
// gesteuert.

import {
  apiClient,
  toApiProblemError,
  type IngestQuarantaeneGrund,
  type IngestQuarantaeneListe,
  type IngestStatus,
} from '@edms/shared';
import type { CursorParams } from '../shared';

/** `GET /monitoring/ingest/status` — aus der Datenbank abgeleiteter Betriebszustand. */
export async function fetchIngestStatus(): Promise<IngestStatus> {
  const { data, error } = await apiClient.GET('/monitoring/ingest/status', {});
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export interface IngestQuarantaeneListenFilter {
  readonly [key: string]: string | number | boolean | undefined;
  readonly grund?: IngestQuarantaeneGrund;
}

/** `GET /monitoring/ingest/quarantaene` — Cursor-paginiert, neueste zuerst. */
export async function fetchIngestQuarantaeneSeite(
  params: CursorParams & IngestQuarantaeneListenFilter,
): Promise<IngestQuarantaeneListe> {
  const { data, error } = await apiClient.GET('/monitoring/ingest/quarantaene', {
    params: {
      query: {
        ...(params.grund !== undefined ? { grund: params.grund } : {}),
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
