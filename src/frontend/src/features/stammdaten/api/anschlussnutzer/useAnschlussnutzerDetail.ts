import type { AnschlussnutzerDetail } from '@edms/shared';
import { createDetailQuery } from '../shared';
import { anschlussnutzerKeys } from './anschlussnutzerKeys';
import { fetchAnschlussnutzerDetail } from './anschlussnutzerApi';

/**
 * Hook für `operationId: anschlussnutzerLesen` (`GET
 * /stammdaten/anschlussnutzer/{id}`). `stammdatenPii` ist bereits
 * laufzeit-maskiert vom Server geliefert (`null` für `compliance-auditor`/
 * gesperrte/geschredderte Subjekte, D6, analog `useEndkundeDetail`) — die UI
 * rendert diesen Block nur (`PiiMaskedField`, `components/shared`).
 */
export const useAnschlussnutzerDetail = createDetailQuery<AnschlussnutzerDetail>({
  queryKeys: anschlussnutzerKeys,
  fetchDetail: fetchAnschlussnutzerDetail,
});
