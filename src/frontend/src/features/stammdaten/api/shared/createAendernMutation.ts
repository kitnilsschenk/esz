import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { ApiProblemError } from '@edms/shared';
import type { ResourceQueryKeys } from './resourceQueryKeys';
import { createIdempotencyKey } from './idempotencyKey';

export interface AendernMutationVariables<TInput> {
  readonly id: string;
  readonly input: TInput;
}

export interface AendernMutationConfig<TInput, TDetail> {
  readonly queryKeys: ResourceQueryKeys;
  /**
   * Ruft GENAU EINEN `apiClient.PATCH(...)`-Aufruf auf (inkl.
   * `Idempotency-Key`-Header) und mappt Fehler bereits auf `ApiProblemError`.
   */
  readonly aendern: (id: string, input: TInput, idempotencyKey: string) => Promise<TDetail>;
}

/**
 * Fabrik: erzeugt EINE „Ändern"-Mutation für genau eine Stammdaten-Ressource
 * (PATCH, `Idempotency-Key` je Submit) — invalidiert nach Erfolg SOWOHL das
 * betroffene Detail als auch die Listen-Query (geänderte Felder erscheinen
 * ohne manuellen Refresh). Deckt strukturell auch „Status mit Payload ändern"
 * ab (z. B. Nutzungsverhältnis `beenden`, PATCH mit `gueltigBis`-Body) — dort
 * bewusst wiederverwendet statt eine eigene Fabrik zu bauen (identische
 * PATCH-id+body-Form, ADR-0008 §23 / D11). Jede Entität ruft diese Fabrik in
 * ihrer eigenen `use<Entität>Aendern.ts` auf — diese Datei bleibt dabei
 * UNVERÄNDERT (geteiltes Fundament).
 */
export function createAendernMutation<TInput, TDetail>(
  config: AendernMutationConfig<TInput, TDetail>,
): () => UseMutationResult<TDetail, ApiProblemError, AendernMutationVariables<TInput>> {
  return function useAendernMutation(): UseMutationResult<TDetail, ApiProblemError, AendernMutationVariables<TInput>> {
    const queryClient = useQueryClient();

    return useMutation<TDetail, ApiProblemError, AendernMutationVariables<TInput>>({
      mutationFn: (variables) => config.aendern(variables.id, variables.input, createIdempotencyKey()),
      onSuccess: (_detail, variables) => {
        void queryClient.invalidateQueries({ queryKey: config.queryKeys.detail(variables.id) });
        void queryClient.invalidateQueries({ queryKey: config.queryKeys.listen() });
      },
    });
  };
}
