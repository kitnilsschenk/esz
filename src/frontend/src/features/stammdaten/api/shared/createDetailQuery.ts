import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError } from '@edms/shared';
import type { ResourceQueryKeys } from './resourceQueryKeys';

export interface DetailQueryConfig<TDetail> {
  readonly queryKeys: ResourceQueryKeys;
  /** Ruft GENAU EINEN `apiClient.GET(...)`-Aufruf auf und mappt Fehler bereits auf `ApiProblemError`. */
  readonly fetchDetail: (id: string) => Promise<TDetail>;
}

export interface DetailQueryOptions {
  /** Default `true` — auf `false` setzen, solange z. B. eine ID noch nicht bekannt ist. */
  readonly enabled?: boolean;
}

/**
 * Fabrik: erzeugt EINEN `useQuery`-Hook für den Detail-Endpunkt genau einer
 * Stammdaten-Ressource. Jede neue Entität ruft diese Fabrik in ihrer eigenen
 * `use<Entität>Detail.ts` auf — diese Datei bleibt dabei UNVERÄNDERT
 * (geteiltes Fundament, ADR-0008 §23 / D11).
 */
export function createDetailQuery<TDetail>(
  config: DetailQueryConfig<TDetail>,
): (id: string, options?: DetailQueryOptions) => UseQueryResult<TDetail, ApiProblemError> {
  return function useDetailQuery(id: string, options?: DetailQueryOptions): UseQueryResult<TDetail, ApiProblemError> {
    return useQuery<TDetail, ApiProblemError>({
      queryKey: config.queryKeys.detail(id),
      queryFn: () => config.fetchDetail(id),
      enabled: options?.enabled ?? true,
    });
  };
}
