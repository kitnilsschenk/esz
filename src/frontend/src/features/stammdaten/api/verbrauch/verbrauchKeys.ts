import type { Aufloesung } from '@edms/shared';
import { createResourceQueryKeys } from '../shared';

// Query-Key-Factory der Verbrauchs-Ressource (analog `standortKeys.ts`).
export const verbrauchKeys = createResourceQueryKeys('verbrauch');

export interface VerbrauchAnfrage {
  readonly von: string;
  readonly bis: string;
  readonly aufloesung: Aufloesung;
  readonly inklusiveUnterknoten: boolean;
}

/**
 * Aggregierter Verbrauch EINES Standort-Knotens für EIN konkretes
 * Zeitfenster + Auflösung (`GET .../standorte/{id}/verbrauch`,
 * `read:verbrauch_aggregat`). Bewusst KEIN `createDetailQuery` (die Fabrik
 * kennt nur `id`, hier kommen mehrere Query-Parameter hinzu, die den Cache
 * ebenfalls unterscheiden müssen) — analog `standortZaehlerKey`.
 */
export function verbrauchKey(
  standortId: string,
  anfrage: VerbrauchAnfrage,
): readonly [string, 'standort', string, string, string, Aufloesung, boolean] {
  return [
    ...verbrauchKeyPraefix(standortId),
    anfrage.von,
    anfrage.bis,
    anfrage.aufloesung,
    anfrage.inklusiveUnterknoten,
  ] as const;
}

/** PRÄFIX (ohne Zeitfenster) — aktuell ohne Mutationen auf dieser Ressource, für künftige `invalidateQueries` bereits verfügbar. */
export function verbrauchKeyPraefix(standortId: string): readonly [string, 'standort', string] {
  return [...verbrauchKeys.all, 'standort', standortId] as const;
}
