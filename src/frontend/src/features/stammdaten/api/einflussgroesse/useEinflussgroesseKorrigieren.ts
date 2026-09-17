import type { EinflussgroesseKorrekturErgebnis, EinflussgroesseKorrigieren } from '@edms/shared';
import { createAendernMutation } from '../shared';
import { einflussgroesseKeys } from './einflussgroesseKeys';
import { patchEinflussgroesseKorrigieren } from './einflussgroesseApi';

/**
 * Hook für `operationId: einflussgroesseKorrigieren` (`PATCH
 * /stammdaten/einflussgroessen/{einflussgroesseId}`, `update:einflussgroesse`,
 * Rolle `betrieb`). Nutzt die geteilte `createAendernMutation`-Fabrik
 * (identische PATCH-id+body-Form wie ein reguläres „Ändern"). Invalidiert
 * `.listen()` — trifft per Präfix-Matching auch die per-System-Klartext-Liste
 * (`useEinflussgroesseListeFuerSystem`); `.detail(id)` wird ebenfalls
 * invalidiert, ist hier aber ein No-op (kein Query nutzt diesen Schlüssel).
 */
export const useEinflussgroesseKorrigieren = createAendernMutation<EinflussgroesseKorrigieren, EinflussgroesseKorrekturErgebnis>({
  queryKeys: einflussgroesseKeys,
  aendern: patchEinflussgroesseKorrigieren,
});
