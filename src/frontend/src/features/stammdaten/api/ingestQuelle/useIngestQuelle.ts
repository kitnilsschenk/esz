import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, IngestQuelleAendern, IngestQuelleAnlegen, IngestQuelleKonfig } from '@edms/shared';
import { createResourceQueryKeys } from '../shared';
import { fetchIngestQuellen, patchIngestQuelle, postIngestQuelle } from './ingestQuelleApi';

export const ingestQuelleKeys = createResourceQueryKeys('ingest-quelle');

/**
 * Die gepflegten Datenquellen.
 *
 * Anders als der Betriebsstatus daneben ändert sich diese Liste nur, wenn
 * jemand sie ändert — deshalb KEIN Nachladen im Takt. Nach einer Änderung
 * wird sie gezielt für ungültig erklärt.
 */
export function useIngestQuellen(): UseQueryResult<readonly IngestQuelleKonfig[], ApiProblemError> {
  return useQuery<readonly IngestQuelleKonfig[], ApiProblemError>({
    queryKey: ingestQuelleKeys.all,
    queryFn: fetchIngestQuellen,
  });
}

/**
 * Nach dem Anlegen wird AUCH der Betriebsstatus für ungültig erklärt: Eine
 * neue Quelle taucht dort auf, sobald ein Worker sie benutzt, und wer gerade
 * eine angelegt hat, schaut genau darauf.
 */
export function useIngestQuelleAnlegen(): UseMutationResult<
  IngestQuelleKonfig,
  ApiProblemError,
  IngestQuelleAnlegen
> {
  const queryClient = useQueryClient();
  return useMutation<IngestQuelleKonfig, ApiProblemError, IngestQuelleAnlegen>({
    mutationFn: (body) => postIngestQuelle(body, crypto.randomUUID()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ingestQuelleKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['ingest-status'] });
    },
  });
}

export interface QuelleAendernVariablen {
  readonly quelleId: string;
  readonly body: IngestQuelleAendern;
}

export function useIngestQuelleAendern(): UseMutationResult<
  IngestQuelleKonfig,
  ApiProblemError,
  QuelleAendernVariablen
> {
  const queryClient = useQueryClient();
  return useMutation<IngestQuelleKonfig, ApiProblemError, QuelleAendernVariablen>({
    mutationFn: ({ quelleId, body }) => patchIngestQuelle(quelleId, body, crypto.randomUUID()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ingestQuelleKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['ingest-status'] });
    },
  });
}
