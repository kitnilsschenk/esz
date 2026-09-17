import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { ApiProblemError, MesswertZeitreiheAntwort } from '@edms/shared';
import { fetchMesskanalZeitreihe, type MesskanalZeitreiheAnfrage } from './verbrauchApi';

export interface MesskanalZeitreiheLesenInput {
  readonly messkanalId: string;
  readonly anfrage: MesskanalZeitreiheAnfrage;
}

/**
 * Hook für `operationId: messkanalZeitreiheLesen` (`GET
 * .../messkanaele/{messkanalId}`, break-glass `read:verbrauch_detail`,
 * Route B). BEWUSST `useMutation` statt `useQuery`, obwohl fachlich ein
 * GET: dies ist ein explizit vom Nutzer AUSGELÖSTER, auditierter
 * Break-glass-Zugriff (Zweckangabe + Zeitfenster) — kein passiver,
 * automatisch/im Hintergrund erneut abgefragter Server-State (kein
 * `queryKey`, kein Caching, kein `refetchOnWindowFocus` o. ä., die diesen
 * audit-pflichtigen Zugriff unbeabsichtigt vervielfachen könnten).
 */
export function useMesskanalZeitreiheLesen(): UseMutationResult<MesswertZeitreiheAntwort, ApiProblemError, MesskanalZeitreiheLesenInput> {
  return useMutation<MesswertZeitreiheAntwort, ApiProblemError, MesskanalZeitreiheLesenInput>({
    mutationFn: ({ messkanalId, anfrage }) => fetchMesskanalZeitreihe(messkanalId, anfrage),
  });
}
