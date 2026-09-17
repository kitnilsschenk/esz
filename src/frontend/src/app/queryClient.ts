import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiProblemError } from '@edms/shared';
import { refreshAccessTokenSingleFlight } from '../features/auth/api/refreshAccessToken';
import { sollWiederholen } from './retryPolicy';

/** 60 s: Stammdaten ändern sich selten; ein Routenwechsel hin und zurück soll nicht neu laden. */
const STANDARD_STALE_TIME_MS = 60 * 1000;

function istStatus(error: unknown, status: number): boolean {
  return error instanceof ApiProblemError && error.status === status;
}

/**
 * Globale 401-Behandlung für LESENDE Zugriffe (ADR-0002 Teil B §16: „401
 * mitten in der Session → stiller /auth/refresh"). JEDE Query, die mit 401
 * fehlschlägt (z. B. eine abgelaufene Sitzung), löst GENAU EINEN —
 * Web-Locks-serialisierten — Refresh-Versuch aus
 * (`refreshAccessTokenSingleFlight`, Dedupe bei mehreren gleichzeitig
 * scheiternden Queries). Gelingt der Refresh, werden alle Queries neu geladen
 * (jetzt mit frischem Access-Token über die Authorization-Middleware,
 * `client.ts`). Scheitert er, hat `refreshAccessTokenSingleFlight` den
 * Access-Token bereits verworfen — die `AuthGate`-Komponente reagiert darauf
 * von selbst (Memory-Store-Snapshot) und zeigt den Login-Screen; hier ist kein
 * weiterer Retry nötig.
 */
const queryCache = new QueryCache({
  onError: (error) => {
    if (istStatus(error, 401)) {
      void refreshAccessTokenSingleFlight().then((refreshed) => {
        if (refreshed) {
          void queryClient.invalidateQueries();
        }
      });
    }
  },
});

/**
 * Merkt sich, welche Mutation nach einem 401 bereits EINMAL wiederholt wurde.
 * Bewusst ein `WeakSet` über die Mutation-Instanz statt einer Prüfung auf
 * `mutation.state.failureCount`: `execute()` startet den Retryer neu und
 * setzt den Zähler dabei zurück — ein Zähler-basierter Schutz würde bei
 * dauerhaft ungültiger Sitzung endlos im Kreis laufen. Die Instanz-Identität
 * ist der einzige verlässliche Anker, und `WeakSet` hält die abgeräumte
 * Mutation nicht künstlich am Leben.
 */
const bereitsNachRefreshWiederholt = new WeakSet<object>();

/**
 * Dieselbe 401-Behandlung für SCHREIBENDE Zugriffe — und der eigentliche
 * Grund, warum es diesen Cache gibt: Ohne ihn galt der stille Refresh
 * ausschließlich für Queries. Lief das Access-Token ab, WÄHREND jemand ein
 * Formular ausfüllte, scheiterte der Submit mit „nicht angemeldet", obwohl
 * die Sitzung über das httpOnly-Refresh-Cookie erneuerbar gewesen wäre — bei
 * einem großen Formular (Messkonzept-Version: bis zu 20 Energieträger-Zeilen)
 * ein realer Verlust der Eingaben.
 *
 * Nach geglücktem Refresh wird die Mutation GENAU EINMAL neu ausgeführt. Das
 * legt nichts doppelt an: Ein 401 entsteht im `JwtAuthGuard`, also BEVOR der
 * Controller die Anfrage verarbeitet — der erste Versuch hat serverseitig
 * keine Wirkung hinterlassen. (Der frische `Idempotency-Key`, den die
 * Mutations-Fabriken je Lauf erzeugen, ist damit unkritisch.)
 */
const mutationCache = new MutationCache({
  onError: (error, variables, _onMutateResult, mutation) => {
    if (!istStatus(error, 401) || bereitsNachRefreshWiederholt.has(mutation)) {
      return;
    }
    bereitsNachRefreshWiederholt.add(mutation);

    void refreshAccessTokenSingleFlight().then((refreshed) => {
      if (!refreshed) {
        return;
      }
      // `execute` lehnt bei erneutem Fehlschlag ab; der Fehler steht danach
      // ohnehin im Mutations-State (und damit in der Oberfläche), hier wird
      // er nur abgefangen, damit keine unbehandelte Promise-Ablehnung in der
      // Konsole landet.
      void mutation.execute(variables).catch(() => undefined);
    });
  },
});

// Zentrale TanStack-Query-Instanz (Server-State nur über TanStack Query,
// .claude/rules/frontend-react.md). Genau eine Instanz pro App, außerhalb von
// React-Rendering erzeugt.
export const queryClient = new QueryClient({
  queryCache,
  mutationCache,
  defaultOptions: {
    queries: {
      retry: sollWiederholen,
      // Stammdaten sind langlebig: innerhalb einer Minute gilt ein bereits
      // geladener Datensatz als frisch, ein Zurück-Navigieren zeigt ihn
      // sofort statt erneut zu laden. Kurzlebige Betriebsdaten
      // (Freshness/Monitoring) überschreiben das lokal in ihrem eigenen Hook.
      staleTime: STANDARD_STALE_TIME_MS,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Mutations werden NICHT automatisch wiederholt — ein erneuter
      // Schreibversuch ist eine fachliche Entscheidung des Nutzers, nicht
      // des Clients. Einzige Ausnahme ist der 401-Pfad oben (Sitzung
      // erneuert, derselbe Nutzerwille, noch nichts geschrieben).
      retry: false,
    },
  },
});
