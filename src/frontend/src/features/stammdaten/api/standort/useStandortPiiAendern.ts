import type { StandortPiiAendern, StandortPiiDetail } from '@edms/shared';
import { createAendernMutation } from '../shared';
import { standortKeys } from './standortKeys';
import { putStandortPiiAendern } from './standortApi';

/**
 * Hook für `operationId: standortPiiAendern` (`PUT .../standorte/{id}/pii`,
 * PII-Vollersatz, D5: Schreiben ist kein Lesen). Bewusst über
 * `createAendernMutation` (identische `id`+`input`-Form wie ein PATCH,
 * unabhängig vom tatsächlichen HTTP-Verb — analog `useNutzungsverhaeltnis
 * Beenden`). Der Baum-Query-Schlüssel selbst ändert sich durch eine reine
 * PII-Änderung NICHT (Labels leben in einer eigenen Query, s.
 * `useStandortLabels.ts`) — der Aufrufer invalidiert stattdessen den
 * BETROFFENEN Label-Query-Schlüssel.
 */
export const useStandortPiiAendern = createAendernMutation<StandortPiiAendern, StandortPiiDetail>({
  queryKeys: standortKeys,
  aendern: putStandortPiiAendern,
});
