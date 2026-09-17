import { createResourceQueryKeys } from '../shared';

// Query-Key-Factory der Zähler-Ressource (analog `systemKeys.ts`).
export const zaehlerKeys = createResourceQueryKeys('zaehler');

/**
 * Freshness je Messkanal EINES Zählers (`GET .../zaehler/{id}/freshness`,
 * `read:monitoring`, Betriebs-UI-Konzept Punkt 3 „Datenfluss-Status"). Eigener
 * Schlüssel (kein `.detail(id)`) — die Freshness-Liste ist fachlich eine
 * eigene Sub-Ressource, keine Variante des Zähler-Stammdatensatzes.
 */
export function zaehlerFreshnessKey(zaehlerId: string): readonly [string, 'freshness', string] {
  return [...zaehlerKeys.all, 'freshness', zaehlerId] as const;
}
