import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, StandortLabelItem } from '@edms/shared';
import { standortLabelsKey } from './standortKeys';
import { postStandortLabelsBatch } from './standortApi';

export interface StandortLabelsOptions {
  /**
   * `false`, solange die aufrufende Rolle KEIN `read:standort_pii` hat (aus
   * der Sitzung bekannt, `useKannStandortPiiLesen`) ODER die sichtbare
   * Knotenmenge leer ist. Verhindert den Aufruf PROAKTIV, statt ihn
   * abzusetzen und einen 403 abzufangen — vermeidet unnötigen Netzwerk-
   * Traffic UND ein unnötiges (wenn auch abgelehntes) Audit-Ereignis. Ein
   * Nutzer ohne diese Berechtigung ist damit gar nicht erst betroffen von
   * einem Fehlerzustand — der Baum zeigt stattdessen von Anfang an
   * Platzhalter (kein Fehlerfall, s. `useStandortBaumView.ts`).
   */
  readonly enabled: boolean;
}

/**
 * Hook für `operationId: standortLabelsBatch` (`POST .../standorte/labels`,
 * `read:standort_pii`, D5 Linie 2). EIN Aufruf für die GESAMTE übergebene
 * `standortIds`-Menge (der Query-Key bindet die sortierte Id-Menge,
 * `standortLabelsKey`) — niemals ein Aufruf je Knoten. Der Aufrufer
 * (`useStandortBaumView`) übergibt genau die aktuell SICHTBAREN Knoten-Ids
 * (auf-/zugeklappt gefiltert), nicht den gesamten Baum — sonst würde die
 * serverseitige Batch-Obergrenze (500, `standort-labels-anfrage.dto.ts`) bei
 * großen Bäumen (~10⁴ Knoten je Endkunde, ADR-0010 O4) überschritten.
 */
export function useStandortLabels(
  endkundeId: string,
  standortIds: readonly string[],
  options: StandortLabelsOptions,
): UseQueryResult<StandortLabelItem[], ApiProblemError> {
  return useQuery<StandortLabelItem[], ApiProblemError>({
    queryKey: standortLabelsKey(endkundeId, standortIds),
    queryFn: () => postStandortLabelsBatch(endkundeId, standortIds),
    enabled: options.enabled && standortIds.length > 0,
  });
}
