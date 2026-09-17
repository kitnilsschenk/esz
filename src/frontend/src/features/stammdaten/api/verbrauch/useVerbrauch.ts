import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, VerbrauchAggregatAntwort } from '@edms/shared';
import { verbrauchKey, type VerbrauchAnfrage } from './verbrauchKeys';
import { fetchVerbrauch } from './verbrauchApi';

/**
 * Hook für `operationId: verbrauchAggregatLesen` (`GET
 * .../standorte/{id}/verbrauch`, `read:verbrauch_aggregat`, PII-frei).
 * BEWUSST kein `createDetailQuery` (die Fabrik erwartet nur `id`, hier kommen
 * mehrere Filter-Parameter hinzu) — analog `useZaehlerUnterKnoten.ts`.
 *
 * `enabled` liegt beim Aufrufer (`useVerbrauchView`): die Abfrage darf erst
 * laufen, sobald ein gültiges, nicht-leeres Zeitfenster (`von < bis`)
 * vorliegt — sonst würde jede Tastatureingabe im Datumsfeld einen
 * unnötigen/ungültigen Request auslösen.
 */
export function useVerbrauch(
  standortId: string,
  anfrage: VerbrauchAnfrage,
  options: { readonly enabled?: boolean } = {},
): UseQueryResult<VerbrauchAggregatAntwort, ApiProblemError> {
  return useQuery<VerbrauchAggregatAntwort, ApiProblemError>({
    queryKey: verbrauchKey(standortId, anfrage),
    queryFn: () => fetchVerbrauch(standortId, anfrage),
    enabled: options.enabled ?? true,
  });
}
