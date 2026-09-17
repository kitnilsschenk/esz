import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, MesskanalFreshnessItem } from '@edms/shared';
import { zaehlerFreshnessKey } from './zaehlerKeys';
import { fetchZaehlerFreshness } from './zaehlerApi';

/**
 * Hook für `operationId: zaehlerFreshness` (`GET
 * .../zaehler/{zaehlerId}/freshness`, `read:monitoring`). BEWUSST kein
 * `createDetailQuery` (die Fabrik bindet an `queryKeys.detail(id)`, hier
 * braucht es einen eigenen Schlüssel-Namensraum, s. `zaehlerFreshnessKey`) —
 * analog `useStandortBaum.ts`.
 */
export function useZaehlerFreshness(zaehlerId: string): UseQueryResult<MesskanalFreshnessItem[], ApiProblemError> {
  return useQuery<MesskanalFreshnessItem[], ApiProblemError>({
    queryKey: zaehlerFreshnessKey(zaehlerId),
    queryFn: () => fetchZaehlerFreshness(zaehlerId),
  });
}
