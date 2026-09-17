import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, ZaehlerStandortAktuellDetail } from '@edms/shared';
import { zaehlerAktuelleVerortungKey } from './standortKeys';
import { fetchZaehlerAktuelleVerortung } from './standortApi';

/**
 * Hook für `operationId: zaehlerAktuelleVerortung` (`GET
 * .../zaehler/{zaehlerId}/verortung`, `read:standort`, Betriebs-UI-Konzept
 * Punkt 3). BEWUSST kein `createDetailQuery` (eigener Schlüssel-Namensraum,
 * `zaehlerAktuelleVerortungKey` — analog `useStandortBaum.ts`).
 */
export function useZaehlerAktuelleVerortung(zaehlerId: string): UseQueryResult<ZaehlerStandortAktuellDetail, ApiProblemError> {
  return useQuery<ZaehlerStandortAktuellDetail, ApiProblemError>({
    queryKey: zaehlerAktuelleVerortungKey(zaehlerId),
    queryFn: () => fetchZaehlerAktuelleVerortung(zaehlerId),
  });
}
