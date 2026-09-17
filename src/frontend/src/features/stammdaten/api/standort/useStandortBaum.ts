import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, StandortStruktur } from '@edms/shared';
import { standortBaumKey } from './standortKeys';
import { fetchStandortBaum } from './standortApi';

/**
 * Hook für `operationId: standorteListe` (`GET
 * /stammdaten/endkunden/{endkundeId}/standorte`, `read:standort`, D5
 * Linie 1 — Struktur, PII-frei). BEWUSST kein `createListeQuery` (die
 * geteilte Fabrik setzt Cursor-Pagination voraus, `api/shared/
 * createListeQuery.ts`) — diese Route liefert die flache Baum-Liste als
 * EINEN Response ohne `seite`-Metadaten (ADR-0010 §5, generierter Client-
 * Doku-Kommentar „Bewusst KEINE Cursor-Pagination").
 */
export function useStandortBaum(endkundeId: string): UseQueryResult<StandortStruktur[], ApiProblemError> {
  return useQuery<StandortStruktur[], ApiProblemError>({
    queryKey: standortBaumKey(endkundeId),
    queryFn: () => fetchStandortBaum(endkundeId),
  });
}
