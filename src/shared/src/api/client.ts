// Die EINZIGE `createClient<paths>()`-Instanz im gesamten Monorepo.
//
// Verbindliche Regel (frontend-lead, AP5): `createClient(` und rohes `fetch(`
// sind AUSSERHALB dieser Datei verboten. Jeder API-Aufruf läuft ausschließlich
// über die hier exportierte `apiClient`-Instanz (openapi-fetch) — Feature-Hooks
// rufen nur `apiClient.GET(...)` / `.POST(...)` usw. auf und mappen Fehler
// ausschließlich über `problemError.ts` (.claude/rules/frontend-react.md:
// „API-Calls ausschließlich über den generierten OpenAPI-Client in
// src/shared/api/“).
//
// `paths` ist die Vereinigung ALLER generierten Spec-Pfade (health + auth +
// stammdaten + messwerte + berechnung + nachweis + consent, künftig weitere) — pro Schema-Datei
// existiert eine `generated/<stem>.ts` (siehe `pnpm generate:api`), aber es
// bleibt bei EINER Client-Instanz.
//
// Auth-Middleware (ADR-0002 Teil B, D1/D2): hängt `Authorization: Bearer
// <access>` an jede Anfrage an, AUSSER an die vier BFF-Sitzungssteuer-
// Endpunkte (`security: []` in auth.openapi.yaml — die laufen über das
// httpOnly-Refresh-Cookie, nicht über Bearer). Das Access-Token kommt
// AUSSCHLIESSLICH aus `authTokenStore` (Memory, kein localStorage/
// sessionStorage, Frontend-Rule) — diese Datei liest es nur, geschrieben wird
// es vom Frontend-Auth-Feature nach Login-Bootstrap/Refresh/Logout.
//
// Idempotency-Key (schemas/openapi/**-Regel: alle schreibenden Operationen
// unterstützen `Idempotency-Key`) bleibt ein vorbereiteter Slot — die
// Auth-Endpoints sind laut `auth.openapi.yaml`-Kopfkommentar bewusst
// ausgenommen (OIDC-/Sitzungssteuerung, kein Ressourcen-CRUD); künftige
// Fach-Mutationen ergänzen hier per `apiClient.use({ onRequest })`.

import createClient, { type Middleware } from 'openapi-fetch';
import type { paths as healthPaths } from './generated/health';
import type { paths as authPaths } from './generated/auth';
import type { paths as stammdatenPaths } from './generated/stammdaten';
import type { paths as messwertePaths } from './generated/messwerte';
import type { paths as berechnungPaths } from './generated/berechnung';
import type { paths as nachweisPaths } from './generated/nachweis';
import type { paths as consentPaths } from './generated/consent';
import type { paths as nutzerinfoPaths } from './generated/nutzerinfo';
import type { paths as geraeteerkennungPaths } from './generated/geraeteerkennung';
import type { paths as portalPaths } from './generated/portal';
import { getAccessToken } from './authTokenStore';

type paths = healthPaths &
  authPaths &
  stammdatenPaths &
  messwertePaths &
  berechnungPaths &
  nachweisPaths &
  consentPaths &
  nutzerinfoPaths &
  geraeteerkennungPaths &
  portalPaths;

/**
 * Default = same-origin (leerer baseUrl → relative Requests): Im Dev-Modus
 * proxyt der Vite-Dev-Server `/health*` ans Backend (vite.config.ts), im
 * typischen Deployment werden SPA und API hinter demselben Origin
 * ausgeliefert. Nur getrennte Deployments setzen `VITE_API_BASE_URL`
 * explizit auf eine absolute URL. Ein absoluter Default (früher
 * `http://localhost:3000`) lief im Browser auf CORS-Blockaden, sobald der
 * Port anderweitig belegt war.
 */
const DEFAULT_API_BASE_URL = '';

interface RuntimeEnv {
  readonly VITE_API_BASE_URL?: string;
}

/**
 * Liest `import.meta.env.VITE_API_BASE_URL` ohne dass `@edms/shared` eine
 * Abhängigkeit auf das `vite`-Package benötigt (Dependency-Konservativität,
 * ADR-0001 §10.1 — `@edms/shared` wird ggf. auch außerhalb von Vite
 * konsumiert). Daher gezielt über `unknown` gecastet statt global
 * (`vite/client`) zu deklarieren.
 */
function readRuntimeEnv(): RuntimeEnv {
  const meta = import.meta as unknown as { env?: RuntimeEnv };
  return meta.env ?? {};
}

const baseUrl = readRuntimeEnv().VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL;

export const apiClient = createClient<paths>({ baseUrl });

/**
 * BFF-Sitzungssteuer-Endpunkte (`auth.openapi.yaml`, pro Operation
 * `security: []`): laufen über httpOnly-Cookie + serverseitigen
 * Origin-Allowlist-Check (CSRF), NICHT über Bearer. Ein (ggf. abgelaufener)
 * Access-Token wäre hier irreführend und unnötig — insbesondere
 * `/auth/login`/`/auth/callback` sind ohnehin Browser-Top-Level-Navigationen,
 * nie `apiClient`-Aufrufe; `/auth/refresh`/`/auth/logout` werden bewusst
 * OHNE Authorization-Header aufgerufen.
 */
const COOKIE_SESSION_SCHEMA_PATHS: ReadonlySet<string> = new Set<string>([
  '/auth/login',
  '/auth/callback',
  '/auth/refresh',
  '/auth/logout',
]);

/**
 * Der Endkunden-Bereich des Nutzerportals (`portal.openapi.yaml`,
 * Security-Scheme `portalSitzung`): laeuft ueber das
 * `__Host-edms_portal`-Cookie, NICHT ueber Bearer.
 *
 * Praefix statt Aufzaehlung, und bewusst: Ein Endkunde hat gar kein
 * Keycloak-Token. Waere hier versehentlich eines im Speicher — etwa weil
 * jemand im selben Browser auch die Betriebs-UI offen hat —, wuerde es an
 * jede Portal-Anfrage angehaengt. Der Server ignoriert es zwar, aber das
 * Token verliesse den Betriebskontext ohne jeden Grund.
 *
 * Die Betriebs-Routen der Zugangsvergabe (`/stammdaten/endkunden/.../
 * portal-zugang`) sind hiervon NICHT betroffen: Sie beginnen mit
 * `/stammdaten` und laufen regulaer ueber Bearer.
 */
const PORTAL_KUNDE_PREFIX = '/portal/';

const authorizationMiddleware: Middleware = {
  onRequest({ request, schemaPath }) {
    if (COOKIE_SESSION_SCHEMA_PATHS.has(schemaPath) || schemaPath.startsWith(PORTAL_KUNDE_PREFIX)) {
      return request;
    }

    const accessToken = getAccessToken();
    if (accessToken !== undefined) {
      request.headers.set('Authorization', `Bearer ${accessToken}`);
    }
    return request;
  },
};

apiClient.use(authorizationMiddleware);
