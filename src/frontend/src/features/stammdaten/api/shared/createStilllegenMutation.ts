import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { ApiProblemError } from '@edms/shared';
import type { ResourceQueryKeys } from './resourceQueryKeys';
import { createIdempotencyKey } from './idempotencyKey';

export interface StilllegenMutationConfig<TDetail> {
  readonly queryKeys: ResourceQueryKeys;
  /**
   * Ruft GENAU EINEN `apiClient.DELETE(...)`-Aufruf auf (kein Body, inkl.
   * `Idempotency-Key`-Header) und mappt Fehler bereits auf `ApiProblemError`.
   * IDEMPOTENT laut Controller (erneuter Aufruf auf bereits Stillgelegtes =>
   * 200, unveränderter Zustand).
   */
  readonly stilllegen: (id: string, idempotencyKey: string) => Promise<TDetail>;
}

/**
 * Fabrik: erzeugt EINE Status-Aktions-Mutation ohne Eingabe-Payload
 * (`stilllegen` bei Zähler/Messkanal, idempotenter DELETE — Audit-Codes
 * `*.stillgelegt`) — invalidiert nach Erfolg Detail + Liste, analog
 * `createAendernMutation`. Für Status-Aktionen MIT Payload (z. B.
 * Nutzungsverhältnis `beenden`) wird stattdessen `createAendernMutation`
 * wiederverwendet (identische PATCH-id+body-Form). Jede Entität ruft diese
 * Fabrik in ihrer eigenen `use<Entität>Stilllegen.ts` auf — diese Datei
 * bleibt dabei UNVERÄNDERT (geteiltes Fundament, ADR-0008 §23 / D11).
 */
export function createStilllegenMutation<TDetail>(
  config: StilllegenMutationConfig<TDetail>,
): () => UseMutationResult<TDetail, ApiProblemError, string> {
  return function useStilllegenMutation(): UseMutationResult<TDetail, ApiProblemError, string> {
    const queryClient = useQueryClient();

    return useMutation<TDetail, ApiProblemError, string>({
      mutationFn: (id) => config.stilllegen(id, createIdempotencyKey()),
      onSuccess: (_detail, id) => {
        void queryClient.invalidateQueries({ queryKey: config.queryKeys.detail(id) });
        void queryClient.invalidateQueries({ queryKey: config.queryKeys.listen() });
      },
    });
  };
}
