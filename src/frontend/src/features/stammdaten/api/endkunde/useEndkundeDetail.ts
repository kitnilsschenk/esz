import type { EndkundeDetail } from '@edms/shared';
import { createDetailQuery } from '../shared';
import { endkundeKeys } from './endkundeKeys';
import { fetchEndkundeDetail } from './endkundeApi';

/**
 * Hook für `operationId: endkundeLesen` (`GET /stammdaten/endkunden/{id}`).
 * `stammdatenPii` ist bereits laufzeit-maskiert vom Server geliefert (`null`
 * für `compliance-auditor`/gesperrte/geschredderte Subjekte, D6) — die UI
 * rendert diesen Block nur und entschlüsselt/berechnet NICHTS selbst
 * (`PiiMaskedField`, `components/shared`).
 */
export const useEndkundeDetail = createDetailQuery<EndkundeDetail>({
  queryKeys: endkundeKeys,
  fetchDetail: fetchEndkundeDetail,
});
