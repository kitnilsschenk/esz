import { useSyncExternalStore } from 'react';
import { getAccessTokenSnapshot, subscribeAccessToken, type AccessTokenSnapshot } from '@edms/shared';

/**
 * Reaktiver Zugriff auf den Memory-Access-Token-Zustand ohne zusätzliche
 * State-Bibliothek (`useSyncExternalStore`, React 18) — der eigentliche
 * Speicher (`authTokenStore`) liegt in `@edms/shared`, da auch die
 * API-Client-Middleware (`client.ts`) ihn synchron lesen muss.
 * Bewusst KEIN Zustand/Context mit Persist-Mittel: Access-Token bleibt
 * ausschließlich im Prozess-Speicher (.claude/rules/frontend-react.md).
 */
export function useAccessTokenSnapshot(): AccessTokenSnapshot {
  return useSyncExternalStore(subscribeAccessToken, getAccessTokenSnapshot, getAccessTokenSnapshot);
}
