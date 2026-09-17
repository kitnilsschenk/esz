import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, ZaehlerUnterKnotenItem } from '@edms/shared';
import { standortZaehlerKey } from './standortKeys';
import { fetchZaehlerUnterKnoten, type ZaehlerUnterKnotenParams } from './standortApi';

/**
 * Hook für `operationId: zaehlerUnterKnoten` (`GET
 * .../standorte/{id}/zaehler`, Kern-Query D6, PII-frei). BEWUSST kein
 * `createDetailQuery` (die Fabrik erwartet EIN Objekt, hier kommt ein Array
 * zurück) — analog `useStandortBaum.ts`.
 */
export function useZaehlerUnterKnoten(
  standortId: string,
  params: ZaehlerUnterKnotenParams = {},
  options: { readonly enabled?: boolean } = {},
): UseQueryResult<ZaehlerUnterKnotenItem[], ApiProblemError> {
  return useQuery<ZaehlerUnterKnotenItem[], ApiProblemError>({
    queryKey: standortZaehlerKey(standortId, params.stichtag),
    queryFn: () => fetchZaehlerUnterKnoten(standortId, params),
    enabled: options.enabled ?? true,
  });
}
