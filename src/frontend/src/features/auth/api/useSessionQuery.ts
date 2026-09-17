import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient, toApiProblemError, type ApiProblemError, type SessionInfo } from '@edms/shared';
import { authKeys } from './queryKeys';

/**
 * Hook für `operationId: authSession` (`GET /auth/session`, Bearer-geschützt
 * über die Authorization-Middleware in `client.ts`). Server-State — läuft
 * ausschließlich über TanStack Query (.claude/rules/frontend-react.md); der
 * rohe Access-Token selbst liegt NICHT hier, sondern im `authTokenStore`
 * (Memory, `@edms/shared`).
 *
 * `enabled` wird vom Aufrufer übergeben (Bootstrap-Reihenfolge: erst NACH
 * einem erfolgreichen `/auth/refresh` gibt es überhaupt einen Access-Token,
 * den die Middleware anhängen könnte — ohne `enabled`-Steuerung liefe die
 * Query sonst unnötig ins 401).
 */
export function useSessionQuery(enabled: boolean): UseQueryResult<SessionInfo, ApiProblemError> {
  return useQuery<SessionInfo, ApiProblemError>({
    queryKey: authKeys.session(),
    enabled,
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/auth/session');
      if (error) {
        throw toApiProblemError(error);
      }
      return data;
    },
  });
}
