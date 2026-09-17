import type { BerechnungslaufListItem } from '@edms/shared';
import { createListeQuery } from '../shared';
import { berechnungKeys } from './berechnungKeys';
import { fetchLaeufeSeite, type BerechnungslaufListenFilter } from './berechnungApi';

/**
 * Hook für `operationId: berechnungslaufListeLesen` (`GET
 * /berechnung/endkunden/{endkundeId}/laeufe`, Cursor-Pagination,
 * `read:berechnungslauf`, Rollen `betrieb`/`compliance-auditor`). `endkundeId`
 * PFLICHT-Filter (Sub-Ressource, kein globaler Berechnungslauf-Index, analog
 * `useMesskonzeptVersionenListe`).
 */
export const useBerechnungslaufListe = createListeQuery<BerechnungslaufListItem, BerechnungslaufListenFilter>({
  queryKeys: berechnungKeys,
  fetchSeite: fetchLaeufeSeite,
});

export type { BerechnungslaufListenFilter };
