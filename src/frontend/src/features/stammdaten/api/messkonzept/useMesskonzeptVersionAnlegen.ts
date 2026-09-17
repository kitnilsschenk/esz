import type { MesskonzeptVersionDetail } from '@edms/shared';
import { createAnlegenMutation } from '../shared';
import { messkonzeptKeys } from './messkonzeptKeys';
import { postMesskonzeptVersionAnlegen, type MesskonzeptVersionAnlegenInput } from './messkonzeptApi';

/**
 * Hook für `operationId: messkonzeptVersionAnlegen` (`POST
 * /stammdaten/endkunden/{endkundeId}/messkonzept/versionen`, append-only —
 * KEIN Ändern/Löschen, Linie 3). `endkundeId` ist Teil des Eingabe-Objekts
 * (`MesskonzeptVersionAnlegenInput`, analog `useMesskanalAnlegen`).
 */
export const useMesskonzeptVersionAnlegen = createAnlegenMutation<MesskonzeptVersionAnlegenInput, MesskonzeptVersionDetail>({
  queryKeys: messkonzeptKeys,
  anlegen: postMesskonzeptVersionAnlegen,
});
