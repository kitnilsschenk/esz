// Minimaler externer Store (React-18-`useSyncExternalStore`-Pattern) für den
// Brotkrumenpfad der aktuellen Seite — bewusst nach demselben Muster wie
// `seitentitelStore.ts` nebenan: Ein Context-Provider hätte bei jedem
// Seitenwechsel den gesamten gerouteten Teilbaum neu gerendert; der externe
// Store hält den Re-Render auf die tatsächlichen Abonnenten begrenzt.
//
// Schreiber ist `useBrotkrumen` (je Seite EIN Aufruf), Leser ist
// `app/Brotkrumen.tsx`.

/** EIN Glied des Pfads. Ohne `to` = aktuelle Seite (nicht verlinkt, `aria-current`). */
export interface Brotkrume {
  readonly label: string;
  readonly to?: string;
}

interface BrotkrumenZustand {
  /**
   * Der Pfad, FÜR DEN dieser Eintrag gilt. Der entscheidende Teil des
   * Entwurfs: Der Store hält nicht einfach „die aktuellen Krumen", sondern
   * das Paar (Pfad, Krumen). Der Leser zeigt sie nur an, wenn der gespeicherte
   * Pfad dem aktuellen `location.pathname` entspricht.
   *
   * Ohne diesen Schlüssel gäbe es beim Routenwechsel ein unvermeidliches
   * Zeitfenster: Die alte Seite meldet ihre Krumen beim Unmount ab, die neue
   * meldet ihre beim Mount an — dazwischen liegt bei `lazy`+`Suspense` ein
   * Ladezustand, und je nach Reihenfolge blitzte entweder der ALTE Pfad auf
   * der neuen Seite auf oder der neue verschwände wieder. Mit dem Schlüssel
   * ist ein veralteter Eintrag schlicht keiner: Er passt nicht, also wird
   * nichts gezeigt.
   */
  readonly pfad: string;
  readonly krumen: readonly Brotkrume[];
}

type Listener = () => void;

const LEER: BrotkrumenZustand = { pfad: '', krumen: [] };

let zustand: BrotkrumenZustand = LEER;
const listeners = new Set<Listener>();

function benachrichtige(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Schreibt den Brotkrumenpfad FÜR eine bestimmte Route. */
export function setzeBrotkrumen(pfad: string, krumen: readonly Brotkrume[]): void {
  zustand = { pfad, krumen };
  benachrichtige();
}

/**
 * Räumt den Eintrag ab — aber NUR, wenn er noch der eigene ist. Hat
 * inzwischen eine andere Seite geschrieben, bleibt deren Eintrag stehen
 * (sonst löschte eine spät abgeräumte Vorgängerseite den frisch gesetzten
 * Pfad ihrer Nachfolgerin).
 */
export function loescheBrotkrumen(pfad: string): void {
  if (zustand.pfad !== pfad) {
    return;
  }
  zustand = LEER;
  benachrichtige();
}

/** Synchroner Snapshot für `useSyncExternalStore` — stabile Referenz zwischen Änderungen. */
export function leseBrotkrumen(): BrotkrumenZustand {
  return zustand;
}

/** Abonniert Änderungen; liefert die Abbestell-Funktion (React-Cleanup). */
export function abonniereBrotkrumen(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
