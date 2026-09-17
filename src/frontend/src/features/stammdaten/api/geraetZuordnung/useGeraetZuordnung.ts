import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { ApiProblemError, GeraetZuordnungDetail } from '@edms/shared';
import { createIdempotencyKey } from '../shared';
import { zaehlerKeys } from '../zaehler';
import {
  patchGeraetZuordnungDeaktivieren,
  postGeraetZuordnungAnlegen,
  type GeraetZuordnungAnlegenInput,
} from './geraetZuordnungApi';

/**
 * Beide Mutationen invalidieren den ZÄHLER, nicht eine eigene Ressource — der
 * Anbindungs-Zustand lebt als Feld am `ZaehlerDetail` (ADR-0011 D7). Genau
 * deshalb passen sie nicht in `createAnlegenMutation`/`createAendernMutation`:
 * Die Fabriken invalidieren Detail UND Liste ihrer EIGENEN Ressource, und
 * eine Geräte-Zuordnung hat weder ein eigenes Detail noch eine eigene Liste.
 * Der `Idempotency-Key` kommt aus derselben geteilten Fabrik wie überall.
 */
export function useGeraetZuordnungAnlegen(): UseMutationResult<
  GeraetZuordnungDetail,
  ApiProblemError,
  GeraetZuordnungAnlegenInput
> {
  const queryClient = useQueryClient();

  return useMutation<GeraetZuordnungDetail, ApiProblemError, GeraetZuordnungAnlegenInput>({
    mutationFn: (input) => postGeraetZuordnungAnlegen(input, createIdempotencyKey()),
    onSuccess: (_detail, input) => {
      void queryClient.invalidateQueries({ queryKey: zaehlerKeys.detail(input.zaehlerId) });
    },
  });
}

export interface GeraetZuordnungDeaktivierenVariables {
  readonly geraetZuordnungId: string;
  /** Nur zum Invalidieren der richtigen Zähler-Abfrage — nicht Teil des Requests. */
  readonly zaehlerId: string;
}

export function useGeraetZuordnungDeaktivieren(): UseMutationResult<
  GeraetZuordnungDetail,
  ApiProblemError,
  GeraetZuordnungDeaktivierenVariables
> {
  const queryClient = useQueryClient();

  return useMutation<GeraetZuordnungDetail, ApiProblemError, GeraetZuordnungDeaktivierenVariables>({
    mutationFn: (variables) => patchGeraetZuordnungDeaktivieren(variables.geraetZuordnungId, createIdempotencyKey()),
    onSuccess: (_detail, variables) => {
      void queryClient.invalidateQueries({ queryKey: zaehlerKeys.detail(variables.zaehlerId) });
    },
  });
}
