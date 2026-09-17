import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { ApiProblemError, ZaehlerStandortDetail } from '@edms/shared';
import { createIdempotencyKey } from '../shared';
import { standortZaehlerKeyPraefix, zaehlerAktuelleVerortungKey } from './standortKeys';
import { postZaehlerVerortungAnlegen, type ZaehlerVerortungAnlegenInput } from './standortApi';

/**
 * Hook für `operationId: zaehlerVerortungAnlegen` (`POST
 * /stammdaten/zaehler/{zaehlerId}/verortung`, D3 "Umsetzen"). BEWUSST KEINE
 * der geteilten Anlegen-/Ändern-Fabriken (`api/shared/*`) — deren
 * Invalidierungs-Ziel ist `queryKeys.listen()`/`queryKeys.detail(id)` einer
 * EINZELNEN Ressource; hier muss stattdessen die "Zähler unter Knoten"-Query
 * DES BETROFFENEN Standorts (`standortZaehlerKey`) invalidiert werden, deren
 * Schlüssel-Form von der generischen Fabrik nicht abgedeckt wird.
 *
 * Invalidiert ZUSÄTZLICH `zaehlerAktuelleVerortungKey(detail.zaehlerId)`
 * (Betriebs-UI-Konzept Punkt 3) — der Standort-Breadcrumb-Block auf der
 * Zähler-Detailseite nutzt DIESELBE Mutation (CTA „Standort zuordnen") und
 * muss nach Erfolg sofort den neuen Pfad zeigen, unabhängig davon, ob die
 * Aktion vom Standort-Baum ODER von der Zähler-Detailseite ausgelöst wurde.
 */
export function useZaehlerVerortungAnlegen(): UseMutationResult<ZaehlerStandortDetail, ApiProblemError, ZaehlerVerortungAnlegenInput> {
  const queryClient = useQueryClient();

  return useMutation<ZaehlerStandortDetail, ApiProblemError, ZaehlerVerortungAnlegenInput>({
    mutationFn: (input) => postZaehlerVerortungAnlegen(input, createIdempotencyKey()),
    onSuccess: (detail) => {
      void queryClient.invalidateQueries({ queryKey: standortZaehlerKeyPraefix(detail.standortId) });
      void queryClient.invalidateQueries({ queryKey: zaehlerAktuelleVerortungKey(detail.zaehlerId) });
    },
  });
}
