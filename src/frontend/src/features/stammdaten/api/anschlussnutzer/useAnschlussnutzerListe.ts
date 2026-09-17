import type { AnschlussnutzerListItem } from '@edms/shared';
import { createListeQuery } from '../shared';
import { anschlussnutzerKeys } from './anschlussnutzerKeys';
import { fetchAnschlussnutzerSeite, type AnschlussnutzerListenFilter } from './anschlussnutzerApi';

/**
 * Hook für `operationId: anschlussnutzerListe` (`GET
 * /stammdaten/anschlussnutzer`, Cursor-Pagination, optionaler
 * `endkundeId`-Filter, PII-freie Listen-Projektion). Wird SOWOHL von der
 * eigenen `AnschlussnutzerTabelle` als auch — als Referenz-Auswahl — von
 * `useNutzungsverhaeltnisAnlegenView` verwendet (Duplikat-Vermeidung
 * gegenüber dem früheren `nutzungsverhaeltnis/anschlussnutzerReferenzApi.ts`).
 */
export const useAnschlussnutzerListe = createListeQuery<AnschlussnutzerListItem, AnschlussnutzerListenFilter>({
  queryKeys: anschlussnutzerKeys,
  fetchSeite: fetchAnschlussnutzerSeite,
});

export type { AnschlussnutzerListenFilter };
