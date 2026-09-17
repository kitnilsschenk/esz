import type { StandortVerschieben, StandortVerschobenErgebnis } from '@edms/shared';
import { createAendernMutation } from '../shared';
import { standortKeys } from './standortKeys';
import { postStandortVerschieben } from './standortApi';

/**
 * Hook für `operationId: standortVerschieben` (`POST
 * .../standorte/{id}/verschieben`, Reparent D6). Der Server lehnt Zyklen
 * (D2.2), Tiefenlimit-Verletzungen (D2.3) und Mandanten-Fremdzugriff (D2.1)
 * mit 409/400 ab — die verständliche deutsche Fehlermeldung dafür baut
 * `useStandortVerschiebenView` aus dem HTTP-Status (NICHT aus dem rohen
 * `error.detail`-Text, der interne ADR-Abschnittsverweise wie "D2.2/D6"
 * enthält).
 */
export const useStandortVerschieben = createAendernMutation<StandortVerschieben, StandortVerschobenErgebnis>({
  queryKeys: standortKeys,
  aendern: postStandortVerschieben,
});
