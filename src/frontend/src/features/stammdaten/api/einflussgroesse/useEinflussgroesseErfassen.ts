import type { EinflussgroesseDetail } from '@edms/shared';
import { createAnlegenMutation } from '../shared';
import { einflussgroesseKeys } from './einflussgroesseKeys';
import { postEinflussgroesseErfassen, type EinflussgroesseErfassenInput } from './einflussgroesseApi';

/**
 * Hook für `operationId: einflussgroesseErfassen` (`POST
 * /stammdaten/systeme/{systemId}/einflussgroessen`, `create:einflussgroesse`,
 * Rolle `betrieb`). Invalidiert über die geteilte Fabrik
 * `einflussgroesseKeys.listen()` — trifft per TanStack-Präfix-Matching AUCH
 * die per-System-Klartext-Liste unter `einflussgroesseKeys.liste({ systemId })`
 * (`useEinflussgroesseListeFuerSystem`), ohne dass diese Datei eine eigene
 * Invalidierungs-Logik bräuchte.
 */
export const useEinflussgroesseErfassen = createAnlegenMutation<EinflussgroesseErfassenInput, EinflussgroesseDetail>({
  queryKeys: einflussgroesseKeys,
  anlegen: postEinflussgroesseErfassen,
});
