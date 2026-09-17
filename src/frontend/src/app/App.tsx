import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AppProviders } from './AppProviders';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { AppShell } from './AppShell';
import { AuthGate } from '../features/auth/components/AuthGate';
import { PortalApp } from '../features/portal';

/**
 * Wurzelkomponente (ADR-0001 §10.7 / AP5, Auth-Login-Flow ADR-0002 Teil B
 * §16, Betriebs-UI-Routing ADR-0008 §23 / D11 Phase 4c). `AuthGate` ist der
 * feste SPA-Einstiegspunkt: Login-Bootstrap (`POST /auth/refresh`) läuft
 * hier einmalig; erst danach wird `AppShell` (Nav + Routing) gerendert.
 * Diese äußere `RouteErrorBoundary` fängt Fehler in `AuthGate` selbst ab
 * (Bootstrap-Absturz) — Fehler INNERHALB einzelner Routen fängt die
 * feingranulare `RouteBoundary` je Route (`AppShell.tsx`).
 */
export function App(): ReactNode {
  return (
    <AppProviders>
      <RouteErrorBoundary>
        <AppEinstieg />
      </RouteErrorBoundary>
    </AppProviders>
  );
}

/** Alles unter diesem Pfad ist Kundenbereich, nichts darüber. */
const PORTAL_PRAEFIX = '/portal';

/**
 * Die Weiche zwischen den beiden Anwendungsteilen: Betriebs-UI und
 * Nutzerportal.
 *
 * **Sie steht VOR dem Auth-Gate, und das ist der Punkt.** Der Endkunde hat
 * kein Keycloak-Konto; liefe der Login-Bootstrap (`POST /auth/refresh`) auch
 * für ihn, sähe er beim Aufruf von `/portal` erst den Anmeldebildschirm des
 * Betriebs. Er soll die Betriebsanwendung nie zu sehen bekommen — auch nicht
 * für einen Moment und auch nicht als leere Navigationspunkte.
 *
 * Bewusst eine Pfad-Abfrage und keine Route: Ein `<Route path="/portal/*">`
 * würde den `AppShell` zu einem Nachfahren machen, dessen eigene, absolut
 * notierte Routen dann relativ aufgelöst würden.
 */
function AppEinstieg(): ReactNode {
  const { pathname } = useLocation();

  if (pathname === PORTAL_PRAEFIX || pathname.startsWith(`${PORTAL_PRAEFIX}/`)) {
    return <PortalApp />;
  }

  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  );
}
