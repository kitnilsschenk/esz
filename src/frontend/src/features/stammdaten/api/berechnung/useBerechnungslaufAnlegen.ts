import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import type {
  ApiProblemError,
  BerechnungParametervorschlag,
  BerechnungslaufAnlegen,
  BerechnungslaufAntwort,
} from '@edms/shared';
import { createIdempotencyKey, createResourceQueryKeys } from '../shared';
import { berechnungKeys } from './berechnungKeys';
import { fetchParametervorschlag, postBerechnungslauf } from './berechnungApi';

export const parametervorschlagKeys = createResourceQueryKeys('berechnung-parametervorschlag');

/**
 * Der Parameter-Vorschlag für ein (Endkunde, Messkonzept-Energieträger)-Paar.
 *
 * `enabled` erst, wenn ein Energieträger gewählt ist — vorher gibt es nichts
 * vorzuschlagen, und ein Aufruf ohne `mvetId` wäre ein 400.
 */
export function useParametervorschlag(
  endkundeId: string,
  mvetId: string | undefined,
): UseQueryResult<BerechnungParametervorschlag, ApiProblemError> {
  return useQuery<BerechnungParametervorschlag, ApiProblemError>({
    queryKey: parametervorschlagKeys.detail(`${endkundeId}:${mvetId ?? ''}`),
    queryFn: () => fetchParametervorschlag(endkundeId, mvetId ?? ''),
    enabled: mvetId !== undefined && mvetId !== '',
  });
}

/**
 * Startet einen neuen Berechnungslauf.
 *
 * Der Aufruf rechnet SYNCHRON — die Antwort ist der fertige Lauf. Für einen
 * mehrjährigen Zeitraum dauert das spürbar; die Oberfläche muss das
 * hinschreiben, statt so zu tun, als sei nichts passiert.
 *
 * Invalidiert die Lauf-LISTE (der neue gehört hinein) und den Vorschlag: Er
 * trägt die verwendeten Klimastationen mit, und die Menge hat sich gerade
 * geändert.
 */
export function useBerechnungslaufAnlegen(): UseMutationResult<
  BerechnungslaufAntwort,
  ApiProblemError,
  BerechnungslaufAnlegen
> {
  const queryClient = useQueryClient();

  return useMutation<BerechnungslaufAntwort, ApiProblemError, BerechnungslaufAnlegen>({
    mutationFn: (input) => postBerechnungslauf(input, createIdempotencyKey()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: berechnungKeys.listen() });
      void queryClient.invalidateQueries({ queryKey: parametervorschlagKeys.all });
    },
  });
}
