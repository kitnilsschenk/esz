import type { MesskonzeptVersionDetail } from '@edms/shared';
import { createDetailQuery } from '../shared';
import { messkonzeptKeys } from './messkonzeptKeys';
import { fetchMesskonzeptVersionDetail } from './messkonzeptApi';

/**
 * Hook für `operationId: messkonzeptVersionLesen` (`GET
 * /stammdaten/endkunden/{endkundeId}/messkonzept/versionen/{versionNr}`).
 * Der `id`-Parameter ist der zusammengesetzte Schlüssel aus
 * `encodeMesskonzeptVersionId({endkundeId, versionNr})` (siehe
 * `messkonzeptApi.ts` — `versionNr` ist nur je Endkunde eindeutig).
 */
export const useMesskonzeptVersionDetail = createDetailQuery<MesskonzeptVersionDetail>({
  queryKeys: messkonzeptKeys,
  fetchDetail: fetchMesskonzeptVersionDetail,
});
