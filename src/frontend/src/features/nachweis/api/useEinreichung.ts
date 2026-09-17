import type { Einreichung, EinreichungDifferenzZeile } from '@edms/shared';
import { createAnlegenMutation, createDetailQuery, createListeQuery } from '../../stammdaten/api/shared';
import { einreichungDifferenzKeys, einreichungKeys } from './nachweisKeys';
import {
  fetchEinreichungDetail,
  fetchEinreichungDifferenzenSeite,
  postEinreichungVermerken,
  type EinreichungDifferenzenListenFilter,
  type EinreichungVermerkenInput,
} from './einreichungApi';

/** `operationId: einreichungLesen` — Rollen `betrieb`/`compliance-auditor` (B10). */
export const useEinreichungDetail = createDetailQuery<Einreichung>({
  queryKeys: einreichungKeys,
  fetchDetail: fetchEinreichungDetail,
});

/** `operationId: einreichungDifferenzenLesen` — Cursor-Pagination, `einreichungId` PFLICHT-Filter. */
export const useEinreichungDifferenzenListe = createListeQuery<
  EinreichungDifferenzZeile,
  EinreichungDifferenzenListenFilter
>({
  queryKeys: einreichungDifferenzKeys,
  fetchSeite: fetchEinreichungDifferenzenSeite,
});

/** `operationId: einreichungVermerken` — frischer `Idempotency-Key` je Submit (Fabrik). */
export const useEinreichungVermerken = createAnlegenMutation<EinreichungVermerkenInput, Einreichung>({
  queryKeys: einreichungKeys,
  anlegen: postEinreichungVermerken,
});

export type { EinreichungDifferenzenListenFilter, EinreichungVermerkenInput };
