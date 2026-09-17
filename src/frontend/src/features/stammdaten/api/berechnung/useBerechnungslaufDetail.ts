import type { BerechnungslaufAntwort } from '@edms/shared';
import { createDetailQuery } from '../shared';
import { berechnungKeys } from './berechnungKeys';
import { fetchLaufDetail } from './berechnungApi';

/**
 * Hook für `operationId: berechnungslaufLesen` (`GET
 * /berechnung/laeufe/{laufId}`, `read:berechnungslauf`, Rollen
 * `betrieb`/`compliance-auditor`) — Lauf-Kopf inkl. `ergebnisse`-Monatszeilen.
 */
export const useBerechnungslaufDetail = createDetailQuery<BerechnungslaufAntwort>({
  queryKeys: berechnungKeys,
  fetchDetail: fetchLaufDetail,
});
