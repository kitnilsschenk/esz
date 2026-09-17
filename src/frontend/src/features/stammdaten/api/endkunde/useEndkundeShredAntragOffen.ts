import type { ShredAntrag } from '@edms/shared';
import { createDetailQuery } from '../shared';
import { shredAntragKeys } from './shredAntragKeys';
import { fetchOffenerShredAntrag } from './endkundeApi';

/**
 * Hook für den „offener Antrag"-Read (GET `.../shred-antraege`, clientseitig
 * auf den EINEN offenen Antrag reduziert — `fetchOffenerShredAntrag`,
 * ADR-0009 §2.1/§5). Die geteilte `createDetailQuery`-Fabrik passt strukturell
 * 1:1 (EIN `id` (=`endkundeId`) → EIN Wert) — hier `ShredAntrag | null` statt
 * eines generierten `*Detail`-DTOs; `null` bedeutet HIER „kein offener
 * Antrag" (NICHT „maskiert" wie bei `PiiMaskedField`).
 */
export const useEndkundeShredAntragOffen = createDetailQuery<ShredAntrag | null>({
  queryKeys: shredAntragKeys,
  fetchDetail: fetchOffenerShredAntrag,
});
