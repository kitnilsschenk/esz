// Einzige Stelle, die für die Monitoring-Ressource `apiClient.GET(...)`
// aufruft (`.claude/rules/frontend-react.md`). NUR-lesend (DE-02,
// `read:monitoring`) — es gibt keine schreibenden Operationen
// (`monitoring.controller.ts` bietet ausschließlich `liste`).

import {
  apiClient,
  toApiProblemError,
  type AusfallListe,
  type EinschraenkungFristReport,
  type VollstaendigkeitListe,
} from '@edms/shared';
import type { CursorParams } from '../shared';

export interface VollstaendigkeitListenFilter {
  readonly [key: string]: string | number | boolean | undefined;
  readonly endkundeId?: string;
  readonly nurMitLuecken?: boolean;
}

export async function fetchVollstaendigkeitSeite(
  params: CursorParams & VollstaendigkeitListenFilter,
): Promise<VollstaendigkeitListe> {
  const { data, error } = await apiClient.GET('/monitoring/vollstaendigkeit', {
    params: {
      query: {
        ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
        ...(params.endkundeId !== undefined ? { endkundeId: params.endkundeId } : {}),
        ...(params.nurMitLuecken !== undefined ? { nurMitLuecken: params.nurMitLuecken } : {}),
      },
    },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `read:monitoring` — TB-04-Ausfälle/überfällige Kanäle (`GET
 * /monitoring/ausfaelle`, Betriebs-UI-Konzept Punkt 1/6). Cursor-paginiert,
 * KEIN Filter-Objekt (die Route kennt keine Query-Filter außer `cursor`/
 * `limit`) — bewusst KEIN Total-Count (teure COUNT-Abfrage vermieden), die
 * Dashboard-Kachel nutzt `daten.length`/`seite.naechsterCursor` statt einer
 * Gesamtzahl.
 */
export async function fetchAusfaelleSeite(params: CursorParams): Promise<AusfallListe> {
  const { data, error } = await apiClient.GET('/monitoring/ausfaelle', {
    params: {
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
 * Wiedervorlage der befristeten Art.-18-Einschränkungen (ADR-0007 A11.11).
 * `schwelleTage` bleibt optional — ohne Angabe gilt die serverseitige
 * Vorgabe, die dort auch begründet ist.
 */
export async function getEinschraenkungFristen(schwelleTage?: number): Promise<EinschraenkungFristReport> {
  const { data, error } = await apiClient.GET('/monitoring/einschraenkung-fristen', {
    params: { query: schwelleTage === undefined ? {} : { schwelleTage } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
