import type { VollstaendigkeitItem } from '@edms/shared';
import { createListeQuery } from '../shared';
import { monitoringKeys } from './monitoringKeys';
import { fetchVollstaendigkeitSeite, type VollstaendigkeitListenFilter } from './monitoringApi';

/**
 * Hook für `operationId: vollstaendigkeitListe` (`GET
 * /monitoring/vollstaendigkeit`, Cursor-Pagination, `read:monitoring`,
 * Rollen `betrieb`/`compliance-auditor`). Liefert AUSSCHLIESSLICH
 * Lücken-Metadaten (v1: Endkunde-Rollup) — KEINE PII, KEIN Verbrauchsinhalt.
 */
export const useVollstaendigkeitListe = createListeQuery<VollstaendigkeitItem, VollstaendigkeitListenFilter>({
  queryKeys: monitoringKeys,
  fetchSeite: fetchVollstaendigkeitSeite,
});

export type { VollstaendigkeitListenFilter };
