import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { ApiProblemError, ZaehlerStandortDetail } from '@edms/shared';
import { createIdempotencyKey } from '../shared';
import { standortZaehlerKeyPraefix, zaehlerAktuelleVerortungKey } from './standortKeys';
import { postZaehlerVerortungBeenden, type ZaehlerVerortungBeendenInput } from './standortApi';

/**
 * Hook für `operationId: zaehlerVerortungBeenden` (`POST
 * /stammdaten/zaehler/{zaehlerId}/verortung/beenden`). S.
 * `useZaehlerVerortungAnlegen.ts`-Klassen-Dok für die bespoke
 * Invalidierung (geteilte Fabriken passen nicht auf diese Query-Form) —
 * invalidiert ebenfalls `zaehlerAktuelleVerortungKey(detail.zaehlerId)`
 * (Standort-Breadcrumb, Betriebs-UI-Konzept Punkt 3).
 */
export function useZaehlerVerortungBeenden(): UseMutationResult<ZaehlerStandortDetail, ApiProblemError, ZaehlerVerortungBeendenInput> {
  const queryClient = useQueryClient();

  return useMutation<ZaehlerStandortDetail, ApiProblemError, ZaehlerVerortungBeendenInput>({
    mutationFn: (input) => postZaehlerVerortungBeenden(input, createIdempotencyKey()),
    onSuccess: (detail) => {
      void queryClient.invalidateQueries({ queryKey: standortZaehlerKeyPraefix(detail.standortId) });
      void queryClient.invalidateQueries({ queryKey: zaehlerAktuelleVerortungKey(detail.zaehlerId) });
    },
  });
}
