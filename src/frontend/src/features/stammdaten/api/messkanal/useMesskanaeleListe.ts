import type { MesskanalListItem } from '@edms/shared';
import { createListeQuery } from '../shared';
import { messkanalKeys } from './messkanalKeys';
import { fetchMesskanaeleSeite, type MesskanaeleListenFilter } from './messkanalApi';

/**
 * Hook für `operationId: messkanaeleListe` (`GET
 * /stammdaten/zaehler/{zaehlerId}/messkanaele`, Cursor-Pagination,
 * `zaehlerId` PFLICHT-Filter — Sub-Ressource, kein globaler Messkanal-Index).
 */
export const useMesskanaeleListe = createListeQuery<MesskanalListItem, MesskanaeleListenFilter>({
  queryKeys: messkanalKeys,
  fetchSeite: fetchMesskanaeleSeite,
});

export type { MesskanaeleListenFilter };
