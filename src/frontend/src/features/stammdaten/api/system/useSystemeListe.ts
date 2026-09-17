import type { SystemListItem } from '@edms/shared';
import { createListeQuery } from '../shared';
import { systemKeys } from './systemKeys';
import { fetchSystemeSeite, type SystemeListenFilter } from './systemApi';

/**
 * Hook für `operationId: systemeListe` (`GET /stammdaten/systeme`,
 * Cursor-Pagination, optionaler `endkundeId`-Filter).
 */
export const useSystemeListe = createListeQuery<SystemListItem, SystemeListenFilter>({
  queryKeys: systemKeys,
  fetchSeite: fetchSystemeSeite,
});

export type { SystemeListenFilter };
