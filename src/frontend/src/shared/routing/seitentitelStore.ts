// Minimaler externer Store (React-18-`useSyncExternalStore`-Pattern) für den
// aktuellen, bereits übersetzten Seitentitel. `useDocumentTitle` (jede Seite)
// ist der einzige Schreiber, `app/RouteAnnouncer.tsx` der einzige Leser
// (visuell versteckte `aria-live="polite"`-Ansage nach einem Routenwechsel,
// WCAG 2.2 AA 4.1.3 „Status Messages"). Bewusst KEIN Context/Zustand für
// einen einzelnen String: ein Context-Provider hätte bei jedem
// Seitentitel-Wechsel den gesamten geroutete Teilbaum (`<Routes>` in
// `AppShell.tsx`) neu gerendert — der externe Store hält den Re-Render auf
// die tatsächlichen Abonnenten begrenzt (`.claude/rules/frontend-react.md`:
// „Memoisierung/Client-State nur wo nötig").

type Listener = () => void;

let aktuellerSeitentitel = '';
const listeners = new Set<Listener>();

/** Schreibt den aktuellen Seitentitel und benachrichtigt alle Abonnenten. */
export function setzeSeitentitel(titel: string): void {
  aktuellerSeitentitel = titel;
  for (const listener of listeners) {
    listener();
  }
}

/** Synchroner Snapshot für `useSyncExternalStore`. */
export function leseSeitentitel(): string {
  return aktuellerSeitentitel;
}

/** Abonniert Änderungen; liefert die Abbestell-Funktion (React-Cleanup). */
export function abonniereSeitentitel(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
