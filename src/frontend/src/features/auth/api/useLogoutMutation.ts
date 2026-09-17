import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { apiClient, toApiProblemError, clearAccessToken, type ApiProblemError } from '@edms/shared';

/**
 * Hook für `operationId: authLogout` (`POST /auth/logout`, idempotent,
 * Cookie-/Origin-Allowlist-CSRF-Schutz statt Bearer — daher `credentials:
 * 'include'`, damit der httpOnly-Refresh-Cookie mitgesendet wird).
 *
 * Der Memory-Access-Token wird in JEDEM Fall verworfen (`onSettled`) — auch
 * bei einem Netzwerk-/Serverfehler darf die SPA nach einer expliziten
 * Abmeldeaktion nie "angemeldet" bleiben (fail-closed UX, analog zur
 * Guard-Default-Deny-Haltung im Backend).
 */
export function useLogoutMutation(): UseMutationResult<void, ApiProblemError, void> {
  return useMutation<void, ApiProblemError, void>({
    mutationFn: async () => {
      const { error } = await apiClient.POST('/auth/logout', { credentials: 'include' });
      if (error) {
        throw toApiProblemError(error);
      }
    },
    onSettled: () => {
      clearAccessToken();
    },
  });
}
