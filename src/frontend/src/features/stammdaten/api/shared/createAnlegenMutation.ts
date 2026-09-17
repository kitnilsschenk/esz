import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { ApiProblemError } from '@edms/shared';
import type { ResourceQueryKeys } from './resourceQueryKeys';
import { createIdempotencyKey } from './idempotencyKey';

export interface AnlegenMutationConfig<TInput, TDetail> {
  readonly queryKeys: ResourceQueryKeys;
  /**
   * Ruft GENAU EINEN `apiClient.POST(...)`-Aufruf auf (inkl.
   * `Idempotency-Key`-Header) und mappt Fehler bereits auf `ApiProblemError`.
   */
  readonly anlegen: (input: TInput, idempotencyKey: string) => Promise<TDetail>;
}

/**
 * Fabrik: erzeugt EINE „Anlegen"-Mutation für genau eine Stammdaten-Ressource
 * — erzeugt automatisch einen frischen `Idempotency-Key` je Submit und
 * invalidiert nach Erfolg die Listen-Query (neuer Eintrag erscheint ohne
 * manuellen Refresh). Jede neue Entität ruft diese Fabrik in ihrer eigenen
 * `use<Entität>Anlegen.ts` auf — diese Datei bleibt dabei UNVERÄNDERT
 * (geteiltes Fundament, ADR-0008 §23 / D11).
 */
export function createAnlegenMutation<TInput, TDetail>(
  config: AnlegenMutationConfig<TInput, TDetail>,
): () => UseMutationResult<TDetail, ApiProblemError, TInput> {
  return function useAnlegenMutation(): UseMutationResult<TDetail, ApiProblemError, TInput> {
    const queryClient = useQueryClient();

    return useMutation<TDetail, ApiProblemError, TInput>({
      mutationFn: (input) => config.anlegen(input, createIdempotencyKey()),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: config.queryKeys.listen() });
      },
    });
  };
}
