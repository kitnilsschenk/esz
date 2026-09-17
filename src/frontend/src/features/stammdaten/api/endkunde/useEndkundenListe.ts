import type { EndkundeListItem } from '@edms/shared';
import { createListeQuery, type ListenFilter } from '../shared';
import { endkundeKeys } from './endkundeKeys';
import { fetchEndkundenSeite } from './endkundeApi';

/**
 * Hook für `operationId: endkundenListe` (`GET /stammdaten/endkunden`,
 * Cursor-Pagination). Liefert AUSSCHLIESSLICH PII-freie Listen-Projektionen
 * (Linie 2, ADR-0008 §11) — kein Name/keine Anschrift.
 *
 * Endkunde hat aktuell keine Listen-Filter (kein Parent, im Unterschied zu
 * z. B. einer künftigen System-Liste mit `endkundeId`-Filter) — `filter` ist
 * daher ein leeres Objekt; das generische `ListenFilter` bleibt trotzdem der
 * Parametertyp, damit dieselbe Aufrufform für alle Entitäten gilt.
 */
export const useEndkundenListe = createListeQuery<EndkundeListItem, ListenFilter>({
  queryKeys: endkundeKeys,
  fetchSeite: fetchEndkundenSeite,
});
