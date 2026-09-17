import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, GeraetetypKatalog } from '@edms/shared';
import { createResourceQueryKeys } from '../shared';
import { fetchGeraetetypKatalog } from './geraetetypKatalogApi';

export const geraetetypKatalogKeys = createResourceQueryKeys('geraetetyp-katalog');

/**
 * Der Katalog ändert sich nur mit einer neuen Programmversion, nicht im
 * Betrieb — er wird deshalb lange als frisch behandelt statt bei jedem
 * Seitenwechsel erneut geholt.
 */
export function useGeraetetypKatalog(): UseQueryResult<GeraetetypKatalog, ApiProblemError> {
  return useQuery<GeraetetypKatalog, ApiProblemError>({
    queryKey: geraetetypKatalogKeys.all,
    queryFn: fetchGeraetetypKatalog,
    staleTime: 60 * 60 * 1000,
  });
}
