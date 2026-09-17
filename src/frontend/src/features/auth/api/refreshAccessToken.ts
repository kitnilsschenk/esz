import { apiClient, setAccessToken, clearAccessToken } from '@edms/shared';

const REFRESH_LOCK_NAME = 'edms-auth-refresh';

/**
 * `null` = kein Refresh gerade in Flight. Modulweite (Tab-lokale) Dedupe:
 * mehrere gleichzeitige Aufrufer in DIESEM Tab (Bootstrap + 401-Handler
 * mehrerer Queries) teilen sich EIN Promise statt mehrfach `/auth/refresh`
 * aufzurufen.
 */
let inflightRefresh: Promise<boolean> | null = null;

function hasWebLocks(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';
}

async function performRefresh(): Promise<boolean> {
  const { data, error } = await apiClient.POST('/auth/refresh', { credentials: 'include' });
  if (error) {
    // Kein/ungültiges/abgelaufenes Refresh-Cookie bzw. Idle-/Absolut-Timeout
    // (401) oder CSRF-Abwehr (403) — in beiden Fällen: unauthenticated
    // (ADR-0002 Teil B §16, "scheitert der Refresh → zurück zum Login").
    clearAccessToken();
    return false;
  }

  setAccessToken(data.accessToken, data.expiresIn);
  return true;
}

async function runSerialized(): Promise<boolean> {
  if (hasWebLocks()) {
    // Web-Locks-Single-Flight (ADR-0002 Teil B §12, STRIDE-1): serialisiert
    // konkurrierende Refreshes BROWSERWEIT (ein Inflight-Refresh je Origin)
    // gegen das Tab-Race bei der Refresh-Token-Rotation. Andere Tabs warten,
    // bis dieser Tab die Lock freigibt, und lesen danach automatisch das
    // bereits rotierte Cookie (Cookies sind same-origin geteilt) —
    // Keycloaks kleiner `refreshTokenMaxReuse` ist die zusätzliche
    // Defense-in-Depth für verbleibende Netz-Retry-Races.
    //
    // `lib.dom.d.ts` typisiert `LockGrantedCallback<T>` hier (noch) ohne das
    // `T | PromiseLike<T>`-Union der Web-Locks-Spec — ein async Callback
    // liefert daher typseitig `T = Promise<boolean>`. Das `await` unten
    // entpackt dank `Awaited<T>` trotzdem korrekt auf `boolean` (die Lock
    // wird zur Laufzeit ohnehin erst nach Settle des Callback-Promise
    // freigegeben, s. MDN LockManager.request).
    return await navigator.locks.request(REFRESH_LOCK_NAME, () => performRefresh());
  }

  // Fallback ohne Web Locks API (ältere Browser): kein Cross-Tab-Schutz mehr,
  // aber die In-Memory-Promise-Dedupe unten deckt zumindest den
  // Same-Tab-Fall ab.
  return performRefresh();
}

/**
 * Fordert einen neuen Access-Token über das httpOnly-Refresh-Cookie an
 * (`POST /auth/refresh`). Liefert `true` bei Erfolg (Access-Token liegt dann
 * im Memory-Store, `@edms/shared`), `false` wenn der Refresh gescheitert ist
 * (Access-Token wurde bereits verworfen — unauthenticated-Zustand).
 *
 * Aufrufer: `useAuthBootstrap` (App-Start) und der globale
 * `QueryCache`-401-Handler (`app/queryClient.ts`, "401 mitten in der
 * Session → stiller /auth/refresh").
 */
export function refreshAccessTokenSingleFlight(): Promise<boolean> {
  if (inflightRefresh !== null) {
    return inflightRefresh;
  }

  const promise = runSerialized().finally(() => {
    if (inflightRefresh === promise) {
      inflightRefresh = null;
    }
  });
  inflightRefresh = promise;
  return promise;
}
