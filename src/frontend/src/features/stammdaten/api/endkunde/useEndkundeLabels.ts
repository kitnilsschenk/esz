import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, EndkundeLabelItem } from '@edms/shared';
import { endkundeLabelsKey } from './endkundeKeys';
import { postEndkundeLabelsBatch } from './endkundeLabelApi';

export interface EndkundeLabelsOptions {
  /**
   * `false`, solange die aufrufende Rolle KEIN `read:endkunde_pii` hat
   * (`useKannEndkundePiiLesen`). Verhindert den Aufruf PROAKTIV, statt ihn
   * abzusetzen und einen 403 abzufangen — das spart nicht nur Netzwerk-
   * Verkehr, sondern vermeidet ein unnoetiges (wenn auch abgelehntes)
   * Audit-Ereignis. Rollen ohne diese Berechtigung sehen von Anfang an
   * Pseudonyme; das ist KEIN Fehlerzustand.
   */
  readonly enabled: boolean;
}

/**
 * Hook fuer `operationId: endkundeLabelsBatch` (ADR-0008 **D12**).
 *
 * EIN Aufruf fuer die GESAMTE uebergebene Id-Menge — niemals einer je
 * Endkunde. Der Aufrufer uebergibt genau die aktuell DARGESTELLTE Menge (eine
 * Listenseite, die Optionen eines Auswahlfelds), nicht den Gesamtbestand:
 * Auflage A3 bindet den Aufruf an den sichtbaren Ausschnitt, A2 deckelt ihn
 * bei 100.
 *
 * `staleTime` ist bewusst KURZ und `gcTime` klein (A3: kein persistenter,
 * seitenuebergreifender PII-Cache). Klartextnamen sollen nicht laenger im
 * Speicher liegen als die Ansicht, die sie braucht.
 */
export function useEndkundeLabels(
  endkundeIds: readonly string[],
  options: EndkundeLabelsOptions,
): UseQueryResult<EndkundeLabelItem[], ApiProblemError> {
  return useQuery<EndkundeLabelItem[], ApiProblemError>({
    queryKey: endkundeLabelsKey(endkundeIds),
    queryFn: () => postEndkundeLabelsBatch(endkundeIds),
    enabled: options.enabled && endkundeIds.length > 0,
    // 30 s: lange genug, dass Scrollen/Zurueckblaettern innerhalb einer
    // Sitzung keinen neuen auditierten Zugriff ausloest, kurz genug, dass
    // kein Klartext-Bestand im Speicher stehen bleibt (A3).
    staleTime: 30_000,
    gcTime: 60_000,
  });
}
