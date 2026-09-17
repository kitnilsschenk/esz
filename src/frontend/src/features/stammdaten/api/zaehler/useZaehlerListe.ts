import type { ZaehlerListItem } from '@edms/shared';
import { createListeQuery } from '../shared';
import { zaehlerKeys } from './zaehlerKeys';
import { fetchZaehlerSeite, type ZaehlerListenFilter } from './zaehlerApi';

/**
 * Hook für `operationId: zaehlerListe` (`GET /stammdaten/zaehler`,
 * Cursor-Pagination, optionaler `systemId`-Filter).
 */
export const useZaehlerListe = createListeQuery<ZaehlerListItem, ZaehlerListenFilter>({
  queryKeys: zaehlerKeys,
  fetchSeite: fetchZaehlerSeite,
});

export type { ZaehlerListenFilter };
