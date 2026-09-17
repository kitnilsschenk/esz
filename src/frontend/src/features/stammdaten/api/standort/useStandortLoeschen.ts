import type { StandortLoeschErgebnis } from '@edms/shared';
import { createStilllegenMutation } from '../shared';
import { standortKeys } from './standortKeys';
import { deleteStandortLoeschen } from './standortApi';

/**
 * Hook für `operationId: standortLoeschen` (`DELETE .../standorte/{id}`,
 * echtes Hard-DELETE — D2.6, "Korrektur von Fehlanlagen", NUR Blattknoten
 * ohne Verortungshistorie). Passt strukturell in `createStilllegenMutation`
 * (kein Body, nur `id` + Idempotency-Key) — trotz abweichender Fachsemantik
 * (Hard-Delete statt Zustandswechsel) ist die HTTP-Form identisch.
 */
export const useStandortLoeschen = createStilllegenMutation<StandortLoeschErgebnis>({
  queryKeys: standortKeys,
  stilllegen: deleteStandortLoeschen,
});
