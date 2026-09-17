import type { MesskonzeptVersionListItem } from '@edms/shared';
import { createListeQuery } from '../shared';
import { messkonzeptKeys } from './messkonzeptKeys';
import { fetchMesskonzeptVersionenSeite, type MesskonzeptVersionenListenFilter } from './messkonzeptApi';

/**
 * Hook für `operationId: messkonzeptVersionenListe` (`GET
 * /stammdaten/endkunden/{endkundeId}/messkonzept/versionen`,
 * Cursor-Pagination — Server sortiert „neueste zuerst"). `endkundeId` PFLICHT-
 * Filter (Sub-Ressource, kein globaler Messkonzept-Index, analog
 * `useMesskanaeleListe`).
 */
export const useMesskonzeptVersionenListe = createListeQuery<
  MesskonzeptVersionListItem,
  MesskonzeptVersionenListenFilter
>({
  queryKeys: messkonzeptKeys,
  fetchSeite: fetchMesskonzeptVersionenSeite,
});

export type { MesskonzeptVersionenListenFilter };
