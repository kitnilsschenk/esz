import type { StandortStruktur } from '@edms/shared';
import { createAnlegenMutation } from '../shared';
import { standortKeys } from './standortKeys';
import { postStandortAnlegen, type StandortAnlegenInput } from './standortApi';

/**
 * Hook für `operationId: standortAnlegen` (`POST
 * /stammdaten/endkunden/{endkundeId}/standorte`, Wurzel- ODER Kind-Anlage).
 * `queryKeys.listen()` invalidiert hier bewusst NUR den generischen
 * `['standort','liste']`-Präfix (ungenutzt für den Baum) — die tatsächlich
 * relevante Invalidierung des Baum-Query-Schlüssels (`standortBaumKey`)
 * übernimmt der Aufrufer (`useStandortKindAnlegenView`) selbst, da nur er
 * die betroffene `endkundeId` kennt (analog `useMesskonzeptVersionAnlegen`,
 * das ebenfalls `endkundeId` im Eingabe-Objekt trägt).
 */
export const useStandortAnlegen = createAnlegenMutation<StandortAnlegenInput, StandortStruktur>({
  queryKeys: standortKeys,
  anlegen: postStandortAnlegen,
});
