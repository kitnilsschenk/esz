import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { ApiProblemError, ShredAntrag } from '@edms/shared';
import { createIdempotencyKey } from '../shared';
import { shredAntragKeys } from './shredAntragKeys';
import { postShredAntragBeantragen, type ShredAntragBeantragenInput } from './endkundeApi';

/**
 * Hook für `operationId: shredAntragBeantragen` (POST `.../shred-antraege`,
 * ADR-0009 §2.2 — dieser Schritt selbst ist harmlos, legt nur einen Antrag
 * im Status `beantragt` an). EIGENE Mutation statt der geteilten
 * `createAnlegenMutation`-Fabrik: die Fabrik invalidiert nach Erfolg
 * ausschließlich `queryKeys.listen()` — die „offener Antrag"-Query dieses
 * Bausteins lebt aber bewusst unter `shredAntragKeys.detail(endkundeId)`
 * (EIN Wert je Endkunde, `createDetailQuery`-Fabrik, s.
 * `useEndkundeShredAntragOffen.ts`); hier daher die passende gezielte
 * Invalidierung von Hand.
 */
export function useEndkundeShredBeantragen(): UseMutationResult<ShredAntrag, ApiProblemError, ShredAntragBeantragenInput> {
  const queryClient = useQueryClient();

  return useMutation<ShredAntrag, ApiProblemError, ShredAntragBeantragenInput>({
    mutationFn: (input) => postShredAntragBeantragen(input, createIdempotencyKey()),
    onSuccess: (_antrag, variables) => {
      void queryClient.invalidateQueries({ queryKey: shredAntragKeys.detail(variables.endkundeId) });
    },
  });
}
