import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, EinschraenkungFristReport } from '@edms/shared';
import { einschraenkungFristKeys } from './einschraenkungFristKeys';
import { getEinschraenkungFristen } from './monitoringApi';

/**
 * Wiedervorlage der befristeten Art.-18-Einschränkungen (ADR-0007 A11.11).
 *
 * BEWUSST kein `createListeQuery`/`createDetailQuery`: die Antwort ist weder
 * eine cursor-paginierte Liste noch ein Detail zu einer ID, sondern EIN
 * Report-Objekt mit Kennzahl und Positionen. Die Fabriken dafür zu verbiegen
 * (etwa die Schwelle als „id" durchzureichen) würde ihre Bedeutung
 * verwässern — hier ist ein eigener, kleiner Hook der ehrlichere Weg.
 *
 * Die Schwelle geht in den Query-Key ein: zwei Ansichten mit
 * unterschiedlichem Schnitt sind zwei verschiedene Antworten.
 */
export function useEinschraenkungFristen(schwelleTage?: number): UseQueryResult<EinschraenkungFristReport, ApiProblemError> {
  return useQuery<EinschraenkungFristReport, ApiProblemError>({
    queryKey: einschraenkungFristKeys.liste({ schwelleTage }),
    queryFn: () => getEinschraenkungFristen(schwelleTage),
  });
}
