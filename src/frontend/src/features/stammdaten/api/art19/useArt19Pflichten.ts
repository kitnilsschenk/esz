import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, Art19MitteilungAnlegen, Art19PflichtReport } from '@edms/shared';
import { createIdempotencyKey } from '../shared';
import { art19Keys } from './art19Keys';
import { getArt19Pflichten, postArt19Mitteilung } from './art19Api';

/** Pflichten-Report (ADR-0007 A18/A11.12). */
export function useArt19Pflichten(): UseQueryResult<Art19PflichtReport, ApiProblemError> {
  return useQuery<Art19PflichtReport, ApiProblemError>({
    queryKey: art19Keys.listen(),
    queryFn: getArt19Pflichten,
  });
}

/**
 * Dokumentiert eine erfolgte Mitteilung.
 *
 * Bewusst KEINE der geteilten Mutations-Fabriken: die kennen alle das Muster
 * „eine Ressource mit einer ID ändern" und invalidieren Detail + Liste. Hier
 * gibt es keine ID-Ressource, sondern einen Vorgang über eine Kombination
 * (Einreichung × Subjekt × Anlass) — und die Antwort IST bereits der neue
 * Report, weshalb nur die eine Liste zu invalidieren ist.
 */
export function useArt19Mitteilung(): UseMutationResult<Art19PflichtReport, ApiProblemError, Art19MitteilungAnlegen> {
  const queryClient = useQueryClient();

  return useMutation<Art19PflichtReport, ApiProblemError, Art19MitteilungAnlegen>({
    mutationFn: (input) => postArt19Mitteilung(input, createIdempotencyKey()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: art19Keys.listen() });
    },
  });
}
