import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ApiProblemError, HerkunftMapping, HerkunftMappingAnlegen } from '@edms/shared';
import { createAnlegenMutation, createResourceQueryKeys, createStilllegenMutation } from '../shared';
import { anlegenHerkunftMapping, entfernenHerkunftMapping, fetchHerkunftMappingListe } from './herkunftMappingApi';

export const herkunftMappingKeys = createResourceQueryKeys('herkunft-mapping');

/**
 * Bewusst `useQuery` statt `createListeQuery`: Die Liefer-Route ist NICHT
 * cursor-paginiert (eine Zeile je ChirpStack-Application, also die
 * Größenordnung „Gebäude im Bestand"), und die Fabrik setzt eine Seite mit
 * `naechsterCursor` voraus.
 */
export function useHerkunftMappingListe(): UseQueryResult<readonly HerkunftMapping[], ApiProblemError> {
  return useQuery<readonly HerkunftMapping[], ApiProblemError>({
    queryKey: herkunftMappingKeys.listen(),
    queryFn: fetchHerkunftMappingListe,
  });
}

export const useHerkunftMappingAnlegen = createAnlegenMutation<HerkunftMappingAnlegen, HerkunftMapping>({
  queryKeys: herkunftMappingKeys,
  anlegen: anlegenHerkunftMapping,
});

/**
 * Entfernen über die Stilllegen-Fabrik: Sie hat exakt die gebrauchte Form
 * (Kennung rein, Idempotency-Key erzeugt, Liste invalidiert). Der Name der
 * Fabrik meint das Muster, nicht die Fachhandlung.
 */
export const useHerkunftMappingEntfernen = createStilllegenMutation<HerkunftMapping>({
  queryKeys: herkunftMappingKeys,
  stilllegen: entfernenHerkunftMapping,
});
