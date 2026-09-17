import type { StandortAendern, StandortStruktur } from '@edms/shared';
import { createAendernMutation } from '../shared';
import { standortKeys } from './standortKeys';
import { patchStandortAendern } from './standortApi';

/**
 * Hook für `operationId: standortAendern` (`PATCH .../standorte/{id}`,
 * Struktur NUR — `typ`/`sortierung`). Invalidierung des Baum-Query-
 * Schlüssels (`standortBaumKey`) übernimmt der Aufrufer (`useStandort
 * StrukturAendernView`) — s. `useStandortAnlegen.ts`-Klassen-Dok.
 */
export const useStandortAendern = createAendernMutation<StandortAendern, StandortStruktur>({
  queryKeys: standortKeys,
  aendern: patchStandortAendern,
});
