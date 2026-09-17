import type { NutzungsverhaeltnisListItem } from '@edms/shared';
import { createListeQuery } from '../shared';
import { nutzungsverhaeltnisKeys } from './nutzungsverhaeltnisKeys';
import { fetchNutzungsverhaeltnisseSeite, type NutzungsverhaeltnisListenFilter } from './nutzungsverhaeltnisApi';

/**
 * Hook für `operationId: nutzungsverhaeltnisseListe` (`GET
 * /stammdaten/nutzungsverhaeltnisse`, Cursor-Pagination, optionale Filter
 * nach Endkunde/Anschlussnutzer/System).
 */
export const useNutzungsverhaeltnisseListe = createListeQuery<NutzungsverhaeltnisListItem, NutzungsverhaeltnisListenFilter>({
  queryKeys: nutzungsverhaeltnisKeys,
  fetchSeite: fetchNutzungsverhaeltnisseSeite,
});

export type { NutzungsverhaeltnisListenFilter };
