import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiClient, toApiProblemError, type ApiProblemError, type ReadinessStatus } from '@edms/shared';
import { healthKeys } from './queryKeys';

/**
 * Hook für `operationId: getReadiness` (`GET /health/ready`). Fehler werden
 * ausschließlich als `ApiProblemError` geworfen (.claude/rules/frontend-react.md).
 */
export function useReadiness(): UseQueryResult<ReadinessStatus, ApiProblemError> {
  return useQuery<ReadinessStatus, ApiProblemError>({
    queryKey: healthKeys.readiness(),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/health/ready');
      if (error) {
        throw toApiProblemError(error);
      }
      return data;
    },
  });
}
