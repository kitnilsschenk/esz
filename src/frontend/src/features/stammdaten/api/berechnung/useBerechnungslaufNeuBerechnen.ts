import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { ApiProblemError, BerechnungslaufAntwort } from '@edms/shared';
import { createIdempotencyKey } from '../shared';
import { berechnungKeys } from './berechnungKeys';
import { postNeuberechnung } from './berechnungApi';

/**
 * Hook für `berechnungslaufNeuBerechnen` — die nachträgliche Korrektur eines
 * Laufs (ADR-0007 B7/D7).
 *
 * Invalidiert BEIDES: den ersetzten Lauf (er trägt jetzt einen Nachfolger und
 * ist damit nicht mehr maßgeblich) und die Liste (der neue Lauf gehört
 * hinein). Der Aufrufer bekommt den neuen Lauf zurück und kann direkt dorthin
 * führen — ohne das wäre der sichtbare Zustand nach der Korrektur weiterhin
 * der alte.
 */
export function useBerechnungslaufNeuBerechnen(): UseMutationResult<BerechnungslaufAntwort, ApiProblemError, string> {
  const queryClient = useQueryClient();

  return useMutation<BerechnungslaufAntwort, ApiProblemError, string>({
    mutationFn: (laufId) => postNeuberechnung(laufId, createIdempotencyKey()),
    onSuccess: (_neuerLauf, ersetzterLaufId) => {
      void queryClient.invalidateQueries({ queryKey: berechnungKeys.detail(ersetzterLaufId) });
      void queryClient.invalidateQueries({ queryKey: berechnungKeys.listen() });
    },
  });
}
