import type { Foerderjahr, FoerderjahrAnlegen } from '@edms/shared';
import { createAnlegenMutation, createDetailQuery, createListeQuery } from '../../stammdaten/api/shared';
import { foerderjahrKeys } from './nachweisKeys';
import { fetchFoerderjahreSeite, fetchFoerderjahrDetail, postFoerderjahrAnlegen } from './foerderjahrApi';

/** `operationId: foerderjahrListeLesen` — Cursor-Pagination, ohne Filter. */
export const useFoerderjahreListe = createListeQuery<Foerderjahr>({
  queryKeys: foerderjahrKeys,
  fetchSeite: fetchFoerderjahreSeite,
});

/** `operationId: foerderjahrLesen`. */
export const useFoerderjahrDetail = createDetailQuery<Foerderjahr>({
  queryKeys: foerderjahrKeys,
  fetchDetail: fetchFoerderjahrDetail,
});

/** `operationId: foerderjahrAnlegen` — frischer `Idempotency-Key` je Submit (Fabrik). */
export const useFoerderjahrAnlegen = createAnlegenMutation<FoerderjahrAnlegen, Foerderjahr>({
  queryKeys: foerderjahrKeys,
  anlegen: postFoerderjahrAnlegen,
});
