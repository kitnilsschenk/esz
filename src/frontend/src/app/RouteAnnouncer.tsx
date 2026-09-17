import { useEffect, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { abonniereSeitentitel, leseSeitentitel } from '../shared/routing/seitentitelStore';

export interface RouteAnnouncerProps {
  /** `<main id="hauptinhalt" tabIndex={-1}>` aus `AppShell.tsx` — dasselbe Fokus-Ziel wie der Skip-Link. */
  readonly hauptinhaltRef: RefObject<HTMLElement | null>;
}

/**
 * Reagiert auf Client-seitige Routenwechsel (WCAG 2.2 AA 2.4.2/2.4.3/4.1.3 —
 * „Page Titled" / „Focus Order" / „Status Messages"):
 *
 * 1. **Fokus-Management:** verschiebt den Fokus zurück auf den Hauptinhalt
 *    (`<main tabIndex={-1}>`), sobald sich `location.pathname` ändert — auch
 *    bei reinem Parameterwechsel (z. B. zwei Endkunde-Detailseiten mit
 *    unterschiedlicher ID, analog zum `key={location.pathname}`-Muster in
 *    `RouteBoundary.tsx`). Tastatur-/Screenreader-Nutzer:innen bleiben so
 *    nicht am alten Fokuspunkt (typischerweise ein Sidebar-Link) hängen.
 *    Bewusst NICHT beim allerersten Mount (kein Fokus-Klau direkt nach dem
 *    Login-Bootstrap) — ein Ref merkt sich den zuletzt gesehenen Pfad; beim
 *    ersten Effect-Lauf ist er `undefined`.
 * 2. **Live-Region-Ansage:** rendert eine visuell versteckte
 *    `aria-live="polite"`-Region mit dem aktuellen Seitentitel
 *    (`useDocumentTitle`, `shared/hooks/useDocumentTitle.ts`, über
 *    `shared/routing/seitentitelStore.ts`). So erfahren Screenreader-
 *    Nutzer:innen auch dann, welche Seite geladen wurde, wenn der
 *    Fokus-Sprung selbst (noch) keine sprechende Ansage liefert (z. B. bei
 *    inhaltsleerem `<main>` während `Suspense` lädt).
 *
 * Lebt als Dauerkomponente in `AppShell.tsx` (innerhalb von `<main>`, aber
 * außerhalb der `<Routes>`-Kinder) — wird also NICHT bei jedem Routenwechsel
 * neu gemountet, wodurch der „erster Mount"-Schutz über die gesamte
 * App-Laufzeit hält.
 */
export function RouteAnnouncer({ hauptinhaltRef }: RouteAnnouncerProps): ReactNode {
  const { pathname } = useLocation();
  const vorherigerPfadRef = useRef<string | undefined>(undefined);
  const seitentitel = useSyncExternalStore(abonniereSeitentitel, leseSeitentitel, leseSeitentitel);

  useEffect(() => {
    const istAllererstesRendern = vorherigerPfadRef.current === undefined;
    vorherigerPfadRef.current = pathname;

    if (!istAllererstesRendern) {
      hauptinhaltRef.current?.focus();
    }
  }, [pathname, hauptinhaltRef]);

  return (
    <div aria-live="polite" className="sr-only">
      {seitentitel}
    </div>
  );
}
