import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, BaselinePerioden, BaselinePeriodeSetzen } from '@edms/shared';
import { createResourceQueryKeys } from '../shared';
import { fetchBaselinePerioden, setzeBaselinePerioden } from './baselinePeriodeApi';

export const baselinePeriodenKeys = createResourceQueryKeys('baseline-perioden');

export function useBaselinePerioden(mvetId: string): UseQueryResult<BaselinePerioden, ApiProblemError> {
  return useQuery<BaselinePerioden, ApiProblemError>({
    queryKey: baselinePeriodenKeys.detail(mvetId),
    queryFn: () => fetchBaselinePerioden(mvetId),
  });
}

/**
 * Setzt die Perioden.
 *
 * Die Antwort geht direkt in den Cache statt über eine Invalidierung: Der
 * Server liefert den neuen Zustand ohnehin vollständig zurück — samt der
 * abgeleiteten Größen (`tage`, `letzterTag`, `laengeAuffaellig`,
 * `mengeMittel`), die die Oberfläche NICHT selbst rechnet. Ein zweiter
 * Rundlauf ließe genau diese Rückmeldung kurz auf dem alten Stand stehen.
 */
export function useBaselinePeriodenSetzen(
  mvetId: string,
): UseMutationResult<BaselinePerioden, ApiProblemError, readonly BaselinePeriodeSetzen[]> {
  const queryClient = useQueryClient();
  return useMutation<BaselinePerioden, ApiProblemError, readonly BaselinePeriodeSetzen[]>({
    mutationFn: (perioden) => setzeBaselinePerioden(mvetId, perioden),
    onSuccess: (antwort) => {
      queryClient.setQueryData(baselinePeriodenKeys.detail(mvetId), antwort);
    },
  });
}
