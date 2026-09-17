import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient, toApiProblemError, type ApiProblemError, type LivenessStatus } from '@edms/shared';
import { healthKeys } from './queryKeys';

/**
 * Hook für `operationId: getLiveness` (`GET /health`). Fehler werden
 * ausschließlich als `ApiProblemError` geworfen (.claude/rules/frontend-react.md).
 */
export function useLiveness(): UseQueryResult<LivenessStatus, ApiProblemError> {
  return useQuery<LivenessStatus, ApiProblemError>({
    queryKey: healthKeys.liveness(),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/health');
      if (error) {
        throw toApiProblemError(error);
      }
      return data;
    },
  });
}
