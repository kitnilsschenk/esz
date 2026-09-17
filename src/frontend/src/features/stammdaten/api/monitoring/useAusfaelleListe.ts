import type { AusfallListeItem } from '@edms/shared';
import { createListeQuery, type ListenFilter } from '../shared';
import { ausfallKeys } from './ausfallKeys';
import { fetchAusfaelleSeite } from './monitoringApi';

// Die Route kennt keine Query-Filter (nur `cursor`/`limit`) — `ListenFilter`
// bleibt strukturell leer, `createListeQuery` verlangt aber einen Typ-Parameter.
export type AusfaelleListenFilter = ListenFilter;

/**
 * Hook für `operationId: ausfaelleListe` (`GET /monitoring/ausfaelle`,
 * Cursor-Pagination, `read:monitoring`, Rollen `betrieb`/`compliance-auditor`).
 * TB-04 (ADR-0005 §27) — Kanäle mit überfälliger Freshness ODER
 * dokumentiertem, nicht behobenem Ausfall. PII-frei.
 */
export const useAusfaelleListe = createListeQuery<AusfallListeItem, AusfaelleListenFilter>({
  queryKeys: ausfallKeys,
  fetchSeite: fetchAusfaelleSeite,
});
