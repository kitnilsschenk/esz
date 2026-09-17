import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { ApiProblemError, ShredAblehnenAnweisung, ShredAntrag } from '@edms/shared';
import { createIdempotencyKey } from '../shared';
import { shredAntragKeys } from './shredAntragKeys';
import { postShredAntragAblehnen } from './endkundeApi';

export interface EndkundeShredAblehnenVariables {
  readonly endkundeId: string;
  readonly antragId: string;
  readonly input: ShredAblehnenAnweisung;
}

/**
 * Hook für `operationId: shredAntragAblehnen` (POST
 * `.../shred-antraege/{antragId}/ablehnen`, ADR-0009 §2.2 — Vier-Augen,
 * terminal). Analog `useEndkundeShredFreigeben` bewusst eine eigene Mutation
 * (zwei Pfad-Parameter) — betrifft aber NUR die Antrag-Sub-Ressource (der
 * Endkunde selbst ändert sich beim Ablehnen nicht), daher genügt die
 * Invalidierung von `shredAntragKeys.detail(endkundeId)` (macht die
 * „beantragen"-Aktion wieder sichtbar).
 */
export function useEndkundeShredAblehnen(): UseMutationResult<ShredAntrag, ApiProblemError, EndkundeShredAblehnenVariables> {
  const queryClient = useQueryClient();

  return useMutation<ShredAntrag, ApiProblemError, EndkundeShredAblehnenVariables>({
    mutationFn: (variables) =>
      postShredAntragAblehnen(variables.endkundeId, variables.antragId, variables.input, createIdempotencyKey()),
    onSuccess: (_antrag, variables) => {
      void queryClient.invalidateQueries({ queryKey: shredAntragKeys.detail(variables.endkundeId) });
    },
  });
}
