import type {
  EinsparlaufAnlegen,
  EinsparlaufAntwort,
  EinsparlaufBindung,
  EinsparlaufErgebnis,
  EinsparlaufListItem,
} from '@edms/shared';
import { createAnlegenMutation, createDetailQuery, createListeQuery } from '../../stammdaten/api/shared';
import { einsparlaufBindungKeys, einsparlaufErgebnisKeys, einsparlaufKeys } from './nachweisKeys';
import {
  fetchEinsparlaeufeSeite,
  fetchEinsparlaufBindungenSeite,
  fetchEinsparlaufDetail,
  fetchEinsparlaufErgebnisseSeite,
  postEinsparlaufAnlegen,
  type EinsparlaeufeListenFilter,
  type EinsparlaufKindListenFilter,
} from './einsparlaufApi';

/** `operationId: einsparlaufListeLesen` — Cursor-Pagination, optionale Filter (Förderjahr/Art/nurAktuelle). */
export const useEinsparlaeufeListe = createListeQuery<EinsparlaufListItem, EinsparlaeufeListenFilter>({
  queryKeys: einsparlaufKeys,
  fetchSeite: fetchEinsparlaeufeSeite,
});

/** `operationId: einsparlaufLesen` — Kopf inkl. `ergebnisse`. */
export const useEinsparlaufDetail = createDetailQuery<EinsparlaufAntwort>({
  queryKeys: einsparlaufKeys,
  fetchDetail: fetchEinsparlaufDetail,
});

/** `operationId: einsparlaufErgebnisseLesen` — Cursor-Pagination, `einsparlaufId` PFLICHT-Filter. */
export const useEinsparlaufErgebnisseListe = createListeQuery<EinsparlaufErgebnis, EinsparlaufKindListenFilter>({
  queryKeys: einsparlaufErgebnisKeys,
  fetchSeite: fetchEinsparlaufErgebnisseSeite,
});

/** `operationId: einsparlaufBindungenLesen` — Cursor-Pagination, `einsparlaufId` PFLICHT-Filter. */
export const useEinsparlaufBindungenListe = createListeQuery<EinsparlaufBindung, EinsparlaufKindListenFilter>({
  queryKeys: einsparlaufBindungKeys,
  fetchSeite: fetchEinsparlaufBindungenSeite,
});

/** `operationId: einsparlaufAnlegen` — frischer `Idempotency-Key` je Submit (Fabrik). */
export const useEinsparlaufAnlegen = createAnlegenMutation<EinsparlaufAnlegen, EinsparlaufAntwort>({
  queryKeys: einsparlaufKeys,
  anlegen: postEinsparlaufAnlegen,
});

export type { EinsparlaeufeListenFilter, EinsparlaufKindListenFilter };
