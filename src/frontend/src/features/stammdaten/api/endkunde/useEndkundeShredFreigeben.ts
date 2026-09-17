import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { ApiProblemError, ShredFreigebenAnweisung, ShredFreigebenErgebnis } from '@edms/shared';
import { createIdempotencyKey } from '../shared';
import { endkundeKeys } from './endkundeKeys';
import { shredAntragKeys } from './shredAntragKeys';
import { postShredAntragFreigeben } from './endkundeApi';

export interface EndkundeShredFreigebenVariables {
  readonly endkundeId: string;
  readonly antragId: string;
  readonly input: ShredFreigebenAnweisung;
}

/**
 * Hook für `operationId: shredAntragFreigeben` (POST
 * `.../shred-antraege/{antragId}/freigeben`, ADR-0009 §2.2/§2.4 — Vier-Augen,
 * löst ATOMAR die tatsächliche Krypto-Löschung aus). Passt NICHT in die
 * geteilte `createAendernMutation`-Fabrik (die invalidiert genau EINE
 * Ressource anhand einer einzelnen `id`) — diese Aktion betrifft ZWEI
 * Ressourcen (Shred-Antrag UND Endkunde selbst) über ZWEI Pfad-Parameter
 * (`endkundeId`+`antragId`); deshalb hier bewusst eine eigene Mutation mit
 * manueller Mehrfach-Invalidierung: `shredAntragKeys.detail(endkundeId)`
 * (die „offener Antrag"-Karte verschwindet) SOWIE `endkundeKeys.detail`/
 * `.listen()` (verarbeitungsStatus/PII ändern sich serverseitig sofort,
 * treibt zugleich `EndkundeDetailAnsicht`s bestehende
 * Kryptoshredding-Erfolgsmeldung über die `istGeschreddert`-Flanke).
 */
export function useEndkundeShredFreigeben(): UseMutationResult<
  ShredFreigebenErgebnis,
  ApiProblemError,
  EndkundeShredFreigebenVariables
> {
  const queryClient = useQueryClient();

  return useMutation<ShredFreigebenErgebnis, ApiProblemError, EndkundeShredFreigebenVariables>({
    mutationFn: (variables) =>
      postShredAntragFreigeben(variables.endkundeId, variables.antragId, variables.input, createIdempotencyKey()),
    onSuccess: (_ergebnis, variables) => {
      void queryClient.invalidateQueries({ queryKey: shredAntragKeys.detail(variables.endkundeId) });
      void queryClient.invalidateQueries({ queryKey: endkundeKeys.detail(variables.endkundeId) });
      void queryClient.invalidateQueries({ queryKey: endkundeKeys.listen() });
    },
  });
}
