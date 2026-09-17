import type { PreflightBefund, Preflight, PreflightMitBefunden } from '@edms/shared';
import { createAnlegenMutation, createDetailQuery, createListeQuery } from '../../stammdaten/api/shared';
import { preflightBefundKeys, preflightKeys } from './nachweisKeys';
import {
  fetchPreflightBefundeSeite,
  fetchPreflightDetail,
  postPreflightAusfuehren,
  type PreflightAusfuehrenInput,
  type PreflightBefundeListenFilter,
} from './preflightApi';

/** `operationId: preflightLesen` — Kopf (Ergebnis-Ampel, Befund-Zähler, Umfang). */
export const usePreflightDetail = createDetailQuery<Preflight>({
  queryKeys: preflightKeys,
  fetchDetail: fetchPreflightDetail,
});

/** `operationId: preflightBefundeLesen` — Cursor-Pagination, `preflightId` PFLICHT-Filter. */
export const usePreflightBefundeListe = createListeQuery<PreflightBefund, PreflightBefundeListenFilter>({
  queryKeys: preflightBefundKeys,
  fetchSeite: fetchPreflightBefundeSeite,
});

/**
 * `operationId: preflightAusfuehren`. Die `createAnlegenMutation`-Fabrik
 * invalidiert nach Erfolg die Preflight-LISTE — die es serverseitig gar nicht
 * gibt (kein `GET /nachweis/preflights`). Das ist folgenlos (eine
 * Invalidierung ohne Abonnenten tut nichts) und der Preis dafür, die geteilte
 * Fabrik samt `Idempotency-Key`-Erzeugung zu verwenden statt sie zu kopieren.
 */
export const usePreflightAusfuehren = createAnlegenMutation<PreflightAusfuehrenInput, PreflightMitBefunden>({
  queryKeys: preflightKeys,
  anlegen: postPreflightAusfuehren,
});

export type { PreflightAusfuehrenInput, PreflightBefundeListenFilter };
