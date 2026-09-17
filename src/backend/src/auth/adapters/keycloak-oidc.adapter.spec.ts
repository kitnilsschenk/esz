import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeycloakOidcAdapter } from './keycloak-oidc.adapter';
import { OidcExchangeError, OidcProviderUnavailableError } from './keycloak-oidc.port';
import { AuthConfigService } from '../auth.config';
import { createTestJwtIssuer } from '../test-support/jwt-test-support';
import type { TestJwtIssuer } from '../test-support/jwt-test-support';

const ISSUER_URL = 'http://localhost:8080/realms/edms';
const CLIENT_ID = 'edms-bff';

function setRequiredEnv(): void {
  process.env['KEYCLOAK_ISSUER_URL'] = ISSUER_URL;
  process.env['OIDC_CLIENT_ID'] = CLIENT_ID;
  process.env['EDMS_BFF_CLIENT_SECRET'] = 'test-secret';
  process.env['OIDC_REDIRECT_URI'] = 'http://localhost:3000/auth/callback';
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * Typisierter `fetch`-Mock: die Parameter-Signatur `(url, init)` ist
 * ABSICHTLICH explizit angegeben (statt eines null-stelligen
 * Implementierungs-Callbacks) — sonst leitet Vitest aus einem `() => ...`
 * eine leere Parameter-Tupel für `.mock.calls[number]` ab, was
 * `noUncheckedIndexedAccess`-sichere Zugriffe auf die tatsächlich
 * übergebenen Argumente unmöglich macht. Bewusst KEIN `async`, sondern
 * `Promise.resolve(...)`/`Promise.reject(...)` — der übergebene `handler`
 * liefert bereits ein `Promise<Response>`, ein `async`-Wrapper ohne eigenes
 * `await` würde `@typescript-eslint/require-await` auslösen.
 */
function createFetchMock(handler: (url: string, init?: RequestInit) => Promise<Response>): ReturnType<typeof vi.fn> {
  return vi.fn((url: string, init?: RequestInit) => handler(url, init));
}

interface CapturedFetchCall {
  readonly url: string;
  readonly body: string;
}

/**
 * `noUncheckedIndexedAccess`-sicherer Zugriff auf den ersten Mock-Aufruf —
 * UND eine echte Laufzeit-Engung von `body` auf `string` (statt eines
 * `String(...)`-Aufrufs auf den breiten `BodyInit | null | undefined`-Typ,
 * der `@typescript-eslint/no-base-to-string` auslösen würde): der Adapter
 * ruft `fetch` ausschließlich mit einem bereits serialisierten
 * `URLSearchParams.toString()`-Body auf, die Prüfung belegt das statt es
 * nur zu behaupten.
 */
function firstFetchCall(fetchMock: ReturnType<typeof createFetchMock>): CapturedFetchCall {
  const call = fetchMock.mock.calls[0] as [string, RequestInit | undefined] | undefined;
  if (call === undefined) {
    throw new Error('fetch wurde nicht aufgerufen.');
  }

  const [url, init] = call;
  if (typeof init?.body !== 'string') {
    throw new Error('Erwarteter string-Body fehlt im fetch-Aufruf.');
  }

  return { url, body: init.body };
}

describe('KeycloakOidcAdapter (ADR-0002 Teil B §12, backend-lead-Votum F1)', () => {
  let issuer: TestJwtIssuer;
  let adapter: KeycloakOidcAdapter;

  beforeEach(async () => {
    setRequiredEnv();
    issuer = await createTestJwtIssuer();
    adapter = new KeycloakOidcAdapter(new AuthConfigService(), issuer.keyResolver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('baut die Authorization-URL mit PKCE S256 + allen Pflicht-Parametern', () => {
    const url = adapter.buildAuthorizationUrl({ state: 's', nonce: 'n', codeChallenge: 'c' });
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe(`${ISSUER_URL}/protocol/openid-connect/auth`);
    expect(parsed.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('state')).toBe('s');
    expect(parsed.searchParams.get('nonce')).toBe('n');
    expect(parsed.searchParams.get('code_challenge')).toBe('c');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('tauscht den Code erfolgreich und validiert das ID-Token gegen die JWKS', async () => {
    const idToken = await issuer.sign({ iss: ISSUER_URL, aud: CLIENT_ID, sub: 'sub-1', nonce: 'nonce-1' });
    const fetchMock = createFetchMock(() =>
      Promise.resolve(jsonResponse(200, { access_token: 'at', refresh_token: 'rt', id_token: idToken, expires_in: 300 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.exchangeAuthorizationCode('code-1', 'verifier-1');

    expect(result.accessToken).toBe('at');
    expect(result.refreshToken).toBe('rt');
    expect(result.expiresIn).toBe(300);
    expect(result.idTokenClaims.sub).toBe('sub-1');
    expect(result.idTokenClaims.nonce).toBe('nonce-1');

    const { body } = firstFetchCall(fetchMock);
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code_verifier=verifier-1');
  });

  it('wirft OidcExchangeError, wenn das ID-Token die falsche audience trägt', async () => {
    const idToken = await issuer.sign({ iss: ISSUER_URL, aud: 'ein-anderer-client', sub: 'sub-1' });
    vi.stubGlobal(
      'fetch',
      createFetchMock(() =>
        Promise.resolve(
          jsonResponse(200, { access_token: 'at', refresh_token: 'rt', id_token: idToken, expires_in: 300 }),
        ),
      ),
    );

    await expect(adapter.exchangeAuthorizationCode('code-1', 'verifier-1')).rejects.toBeInstanceOf(OidcExchangeError);
  });

  it('wirft OidcExchangeError bei nicht-ok Token-Endpoint-Antwort', async () => {
    vi.stubGlobal('fetch', createFetchMock(() => Promise.resolve(jsonResponse(400, { error: 'invalid_grant' }))));

    await expect(adapter.exchangeAuthorizationCode('code-1', 'verifier-1')).rejects.toBeInstanceOf(OidcExchangeError);
  });

  it('wirft OidcProviderUnavailableError, wenn Keycloak nicht erreichbar ist', async () => {
    vi.stubGlobal(
      'fetch',
      createFetchMock(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    await expect(adapter.exchangeAuthorizationCode('code-1', 'verifier-1')).rejects.toBeInstanceOf(
      OidcProviderUnavailableError,
    );
  });

  it('refreshAccessToken() ruft grant_type=refresh_token korrekt auf', async () => {
    const fetchMock = createFetchMock(() =>
      Promise.resolve(jsonResponse(200, { access_token: 'at2', refresh_token: 'rt2', expires_in: 300 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.refreshAccessToken('rt-alt');

    expect(result.accessToken).toBe('at2');
    const { body } = firstFetchCall(fetchMock);
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=rt-alt');
  });

  it('endSession() ist tolerant gegenüber einem bereits ungültigen Refresh-Token (Idempotenz)', async () => {
    vi.stubGlobal('fetch', createFetchMock(() => Promise.resolve(jsonResponse(400, { error: 'invalid_grant' }))));

    await expect(adapter.endSession('bereits-ungueltig')).resolves.toBeUndefined();
  });

  it('endSession() eskaliert bei 5xx als OidcProviderUnavailableError', async () => {
    vi.stubGlobal('fetch', createFetchMock(() => Promise.resolve(jsonResponse(503, { error: 'unavailable' }))));

    await expect(adapter.endSession('rt')).rejects.toBeInstanceOf(OidcProviderUnavailableError);
  });
});
