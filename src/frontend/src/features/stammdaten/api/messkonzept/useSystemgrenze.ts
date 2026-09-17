import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, Systemgrenze } from '@edms/shared';
import { createResourceQueryKeys } from '../shared';
import { fetchSystemgrenze, setzeSystemgrenze } from './systemgrenzeApi';

export const systemgrenzeKeys = createResourceQueryKeys('systemgrenze');

export function useSystemgrenze(mvetId: string): UseQueryResult<Systemgrenze, ApiProblemError> {
  return useQuery<Systemgrenze, ApiProblemError>({
    queryKey: systemgrenzeKeys.detail(mvetId),
    queryFn: () => fetchSystemgrenze(mvetId),
  });
}

/**
 * Setzt die Grenze.
 *
 * Die Antwort wird direkt in den Cache geschrieben statt eine Invalidierung
 * auszulösen: Der Server liefert den neuen Zustand ohnehin vollständig
 * zurück, und ein zweiter Rundlauf ließe die Ansicht kurz auf dem alten Stand
 * stehen — bei einer Angabe, die über die Richtigkeit der Einsparzahlen
 * entscheidet, ist genau das irritierend.
 */
export function useSystemgrenzeSetzen(
  mvetId: string,
): UseMutationResult<Systemgrenze, ApiProblemError, readonly string[]> {
  const queryClient = useQueryClient();
  return useMutation<Systemgrenze, ApiProblemError, readonly string[]>({
    mutationFn: (systemIds) => setzeSystemgrenze(mvetId, systemIds),
    onSuccess: (grenze) => {
      queryClient.setQueryData(systemgrenzeKeys.detail(mvetId), grenze);
    },
  });
}
