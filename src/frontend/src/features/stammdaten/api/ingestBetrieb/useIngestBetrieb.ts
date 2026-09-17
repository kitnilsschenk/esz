import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, IngestQuarantaeneItem, IngestStatus } from '@edms/shared';
import { createListeQuery, createResourceQueryKeys } from '../shared';
import {
  fetchIngestQuarantaeneSeite,
  fetchIngestStatus,
  type IngestQuarantaeneListenFilter,
} from './ingestBetriebApi';

export const ingestStatusKeys = createResourceQueryKeys('ingest-status');
export const ingestQuarantaeneKeys = createResourceQueryKeys('ingest-quarantaene');

/**
 * Der Status ist eine Momentaufnahme, die sich laufend ändert — anders als
 * Stammdaten, die stehen, bis jemand sie ändert. Er wird deshalb alle 30
 * Sekunden nachgeladen und gilt sofort als veraltet. Wer beim Anschließen
 * eines Zählers auf diese Seite schaut, will nicht erst neu laden müssen, um
 * zu sehen, dass etwas angekommen ist.
 *
 * Bewusst NICHT über `createDetailQuery`: Die Fabrik ist auf eine Ressource
 * MIT ID zugeschnitten; hier gibt es keine.
 */
export function useIngestStatus(): UseQueryResult<IngestStatus, ApiProblemError> {
  return useQuery<IngestStatus, ApiProblemError>({
    queryKey: ingestStatusKeys.all,
    queryFn: fetchIngestStatus,
    refetchInterval: 30_000,
    staleTime: 0,
  });
}

/** Cursor-paginierte Quarantäne-Liste, optional auf einen Grund gefiltert. */
export const useIngestQuarantaeneListe = createListeQuery<IngestQuarantaeneItem, IngestQuarantaeneListenFilter>({
  queryKeys: ingestQuarantaeneKeys,
  fetchSeite: fetchIngestQuarantaeneSeite,
});

export type { IngestQuarantaeneListenFilter };
