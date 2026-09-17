import { useEffect, useState } from 'react';
import { refreshAccessTokenSingleFlight } from '../api/refreshAccessToken';
import { useAccessTokenSnapshot } from './useAccessTokenSnapshot';

export interface AuthBootstrapState {
  /** `true`, solange der initiale Refresh-Versuch noch läuft. */
  readonly isBootstrapping: boolean;
  readonly isAuthenticated: boolean;
}

/**
 * Beim App-Start EINMAL versuchen, über das httpOnly-Refresh-Cookie einen
 * Access-Token zu beziehen (ADR-0002 Teil B §16: "Geschützte SPA-Route ohne
 * Memory-Access-Token → POST /auth/refresh"). Scheitert der Versuch (kein/
 * abgelaufenes Refresh-Cookie), bleibt der Zustand unauthenticated — die
 * `AuthGate`-Komponente zeigt dann den Login-Screen, KEIN automatischer
 * Redirect-Loop zu `/auth/login`.
 *
 * Spätere, session-interne 401s (Access-Token zwischenzeitlich abgelaufen)
 * laufen NICHT über diesen Effekt erneut, sondern über den globalen
 * `QueryCache`-401-Handler (`app/queryClient.ts`) — dieser Hook deckt
 * ausschließlich den initialen Bootstrap ab.
 */
export function useAuthBootstrap(): AuthBootstrapState {
  const { accessToken } = useAccessTokenSnapshot();
  const [isBootstrapping, setIsBootstrapping] = useState(accessToken === undefined);

  useEffect(() => {
    if (accessToken !== undefined) {
      setIsBootstrapping(false);
      return;
    }

    let cancelled = false;
    setIsBootstrapping(true);

    void refreshAccessTokenSingleFlight().finally(() => {
      if (!cancelled) {
        setIsBootstrapping(false);
      }
    });

    return () => {
      cancelled = true;
    };
    // Leeres Dependency-Array ist beabsichtigt: bewusst nur beim Mount
    // ausgeführt (einmaliger App-Start-Bootstrap) — siehe Docblock oben.
    // `react-hooks/exhaustive-deps` ist in diesem Repo nicht konfiguriert
    // (kein `eslint-plugin-react-hooks`, siehe eslint.config.mjs).
  }, []);

  return { isBootstrapping, isAuthenticated: accessToken !== undefined };
}
