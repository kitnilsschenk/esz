// Hält den OIDC-Access-Token AUSSCHLIESSLICH im Prozess-Speicher (Modul-
// Variable) — niemals in `localStorage`/`sessionStorage` (ADR-0002 §5.3/A5,
// .claude/rules/frontend-react.md: „Access-Token nur im Memory“). Dies ist
// die EINZIGE Stelle im Monorepo, die den Access-Token hält:
//   - `client.ts` liest ihn hier synchron für die Authorization-Middleware.
//   - Das Frontend-Auth-Feature (`src/frontend/src/features/auth`) schreibt
//     ihn hier nach Login-Bootstrap/Refresh und verwirft ihn bei Logout bzw.
//     gescheitertem Refresh.
//   - `subscribeAccessToken` + `getAccessTokenSnapshot` sind bewusst so
//     geschnitten, dass sie direkt als `useSyncExternalStore`-Paar im
//     Frontend verwendet werden können — KEINE zusätzliche State-Bibliothek
//     nötig (Bundle-Budget, `.claude/rules/frontend-react.md`).
//
// Bewusst KEIN TanStack-Query-Cache-Eintrag: Der Access-Token ist ein
// kurzlebiges Authentifizierungsgeheimnis (ISO/IEC 27001 A.5.17), keine
// cachefähige Server-Ressource — die aus dem Token abgeleitete `SessionInfo`
// (`GET /auth/session`) IST Server-State und läuft über TanStack Query.

export interface AccessTokenSnapshot {
  /** `undefined` = kein gültiger Access-Token im Speicher (unauthentifiziert). */
  readonly accessToken: string | undefined;
  /**
   * Client-seitig geschätzter Ablaufzeitpunkt (Epoch-Millisekunden) — NUR zur
   * proaktiven UI-/Bootstrap-Steuerung (z. B. „bald ablaufend“). Die einzig
   * verbindliche Prüfung bleibt serverseitig (401 von Keycloak/BFF, A4).
   */
  readonly expiresAt: number | undefined;
}

type Listener = () => void;

const UNAUTHENTICATED_SNAPSHOT: AccessTokenSnapshot = { accessToken: undefined, expiresAt: undefined };

let snapshot: AccessTokenSnapshot = UNAUTHENTICATED_SNAPSHOT;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Liefert nur den Token-String (oder `undefined`) — für die API-Middleware. */
export function getAccessToken(): string | undefined {
  return snapshot.accessToken;
}

/** Liefert den vollständigen, unveränderlichen Snapshot (`useSyncExternalStore`-Getter). */
export function getAccessTokenSnapshot(): AccessTokenSnapshot {
  return snapshot;
}

/**
 * Setzt den Access-Token nach erfolgreichem Login-Bootstrap/Refresh
 * (`POST /auth/refresh`). NUR Memory — niemals persistieren.
 */
export function setAccessToken(accessToken: string, expiresInSeconds: number): void {
  snapshot = { accessToken, expiresAt: Date.now() + expiresInSeconds * 1000 };
  notify();
}

/** Verwirft den Access-Token (Logout oder gescheiterter Refresh → unauthenticated). */
export function clearAccessToken(): void {
  if (snapshot === UNAUTHENTICATED_SNAPSHOT) {
    return;
  }
  snapshot = UNAUTHENTICATED_SNAPSHOT;
  notify();
}

/** Abonniert Änderungen (`useSyncExternalStore`-Subscribe-Funktion). Liefert eine Unsubscribe-Funktion. */
export function subscribeAccessToken(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
