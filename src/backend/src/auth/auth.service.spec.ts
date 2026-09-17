import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { AUTH_EVENT_CODES } from '../audit/audit-event-codes';
import type { AuditService } from '../audit/audit.service';
import { AuthConfigService } from './auth.config';
import type {
  AuthorizationRequestParams,
  KeycloakOidcPort,
  TokenExchangeResult,
} from './adapters/keycloak-oidc.port';
import { OidcExchangeError, OidcProviderUnavailableError } from './adapters/keycloak-oidc.port';
import { AUTH_TX_COOKIE_NAME, REFRESH_COOKIE_NAME } from './cookies/cookie.util';
import type { AccessTokenVerifierService } from './jwt/access-token-verifier.service';

function setRequiredEnv(): void {
  process.env['KEYCLOAK_ISSUER_URL'] = 'http://localhost:8080/realms/edms';
  process.env['OIDC_CLIENT_ID'] = 'edms-bff';
  process.env['EDMS_BFF_CLIENT_SECRET'] = 'test-secret';
  process.env['OIDC_REDIRECT_URI'] = 'http://localhost:3000/auth/callback';
}

/** Extrahiert `name=value` (ohne Attribute) aus einem `buildHostCookie(...)`-String, als `Cookie`-Request-Header nutzbar. */
function asCookieHeader(setCookieHeader: string): string {
  return setCookieHeader.split(';')[0] ?? '';
}

function exchangeResult(overrides: Partial<TokenExchangeResult> = {}): TokenExchangeResult {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    idTokenClaims: { sub: 'sub-1' },
    expiresIn: 300,
    ...overrides,
  };
}

/** `noUncheckedIndexedAccess`-sicherer Zugriff auf die zuletzt an `buildAuthorizationUrl` übergebenen Parameter. */
function lastAuthorizeCallParams(
  buildAuthorizationUrlMock: ReturnType<typeof vi.fn>,
): AuthorizationRequestParams {
  const calls = buildAuthorizationUrlMock.mock.calls as AuthorizationRequestParams[][];
  const lastCall = calls[calls.length - 1];
  const params = lastCall?.[0];
  if (params === undefined) {
    throw new Error('buildAuthorizationUrl wurde nicht aufgerufen.');
  }
  return params;
}

describe('AuthService (ADR-0002 Teil B §12, Decorator-Ausnahme F2)', () => {
  let oidc: KeycloakOidcPort;
  let auditService: AuditService;
  let tokenVerifier: AccessTokenVerifierService;
  let service: AuthService;

  beforeEach(() => {
    setRequiredEnv();
    oidc = {
      buildAuthorizationUrl: vi.fn(() => 'https://keycloak.example/auth?...'),
      exchangeAuthorizationCode: vi.fn(() => Promise.resolve(exchangeResult())),
      refreshAccessToken: vi.fn(() => Promise.resolve(exchangeResult())),
      endSession: vi.fn(() => Promise.resolve(undefined)),
    };
    auditService = { append: vi.fn(() => Promise.resolve(undefined)) } as unknown as AuditService;
    tokenVerifier = { verify: vi.fn(() => Promise.resolve({ sub: 'sub-1' })) } as unknown as AccessTokenVerifierService;
    service = new AuthService(oidc, auditService, new AuthConfigService(), tokenVerifier);
  });

  describe('buildLoginRedirect', () => {
    it('liefert die Keycloak-Location und einen SameSite=Lax-Vor-Auth-Cookie', async () => {
      const result = await service.buildLoginRedirect();

      expect(result.location).toBe('https://keycloak.example/auth?...');
      expect(result.authTxCookie).toContain(`${AUTH_TX_COOKIE_NAME}=`);
      expect(result.authTxCookie).toContain('SameSite=Lax');
      expect(result.authTxCookie).toContain('HttpOnly');
    });
  });

  describe('handleCallback', () => {
    it('Happy Path: emittiert auth.anmeldung.erfolg und liefert Refresh-Cookie + festes SPA-Ziel', async () => {
      const login = await service.buildLoginRedirect();
      const authorizeCall = lastAuthorizeCallParams(oidc.buildAuthorizationUrl as ReturnType<typeof vi.fn>);
      (oidc.exchangeAuthorizationCode as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        exchangeResult({ idTokenClaims: { sub: 'sub-1', nonce: authorizeCall.nonce } }),
      );

      const outcome = await service.handleCallback(
        { code: 'code-1', state: authorizeCall.state },
        asCookieHeader(login.authTxCookie),
      );

      expect(outcome.location).toBe('/');
      expect(outcome.refreshCookie).toContain(`${REFRESH_COOKIE_NAME}=refresh-token`);
      expect(outcome.refreshCookie).toContain('SameSite=Strict');
      expect(outcome.clearAuthTxCookie).toContain('Max-Age=0');
      expect(auditService.append).toHaveBeenCalledWith(
        expect.objectContaining({ eventTyp: AUTH_EVENT_CODES.ANMELDUNG_ERFOLG, actorSub: 'sub-1', ergebnis: 'ok' }),
      );
    });

    it('OIDC-Fehler-Rücksprung (error-Query-Parameter) -> 401 + auth.anmeldung.fehlschlag(denied)', async () => {
      await expect(
        service.handleCallback({ state: 's', error: 'access_denied' }, undefined),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(auditService.append).toHaveBeenCalledWith(
        expect.objectContaining({
          eventTyp: AUTH_EVENT_CODES.ANMELDUNG_FEHLSCHLAG,
          actorTyp: 'system',
          ergebnis: 'denied',
          kontext: { grund: 'oidc_fehler_von_keycloak' },
        }),
      );
    });

    it('fehlender/falscher Vor-Auth-Cookie -> 400 state_ungueltig_oder_fehlend', async () => {
      await expect(service.handleCallback({ code: 'c', state: 'irrelevant' }, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('state-Mismatch gegen den entschlüsselten Vor-Auth-Cookie -> 400', async () => {
      const login = await service.buildLoginRedirect();

      await expect(
        service.handleCallback({ code: 'c', state: 'falscher-state' }, asCookieHeader(login.authTxCookie)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('fehlender code (ohne error) -> 400 code_fehlt', async () => {
      const login = await service.buildLoginRedirect();
      const authorizeCall = lastAuthorizeCallParams(oidc.buildAuthorizationUrl as ReturnType<typeof vi.fn>);

      await expect(
        service.handleCallback({ state: authorizeCall.state }, asCookieHeader(login.authTxCookie)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('nonce-Mismatch -> 400 nonce_mismatch', async () => {
      const login = await service.buildLoginRedirect();
      const authorizeCall = lastAuthorizeCallParams(oidc.buildAuthorizationUrl as ReturnType<typeof vi.fn>);
      (oidc.exchangeAuthorizationCode as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        exchangeResult({ idTokenClaims: { sub: 'sub-1', nonce: 'falsche-nonce' } }),
      );

      await expect(
        service.handleCallback({ code: 'code-1', state: authorizeCall.state }, asCookieHeader(login.authTxCookie)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('Keycloak nicht erreichbar -> 503, emittiert idp_nicht_erreichbar mit ergebnis=error (Infra-Fehler, kein Policy-Entscheid)', async () => {
      const login = await service.buildLoginRedirect();
      const authorizeCall = lastAuthorizeCallParams(oidc.buildAuthorizationUrl as ReturnType<typeof vi.fn>);
      (oidc.exchangeAuthorizationCode as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new OidcProviderUnavailableError('down'),
      );

      await expect(
        service.handleCallback({ code: 'code-1', state: authorizeCall.state }, asCookieHeader(login.authTxCookie)),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(auditService.append).toHaveBeenCalledWith(
        expect.objectContaining({
          eventTyp: AUTH_EVENT_CODES.ANMELDUNG_FEHLSCHLAG,
          ergebnis: 'error',
          kontext: { grund: 'idp_nicht_erreichbar' },
        }),
      );
    });

    it('Code-Exchange fehlgeschlagen (OidcExchangeError) -> 400, emittiert ergebnis=error (technischer Fehlschlag, kein Policy-Entscheid)', async () => {
      const login = await service.buildLoginRedirect();
      const authorizeCall = lastAuthorizeCallParams(oidc.buildAuthorizationUrl as ReturnType<typeof vi.fn>);
      (oidc.exchangeAuthorizationCode as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new OidcExchangeError('invalid_grant'),
      );

      await expect(
        service.handleCallback({ code: 'code-1', state: authorizeCall.state }, asCookieHeader(login.authTxCookie)),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(auditService.append).toHaveBeenCalledWith(
        expect.objectContaining({
          eventTyp: AUTH_EVENT_CODES.ANMELDUNG_FEHLSCHLAG,
          ergebnis: 'error',
          kontext: { grund: 'code_exchange_fehlgeschlagen' },
        }),
      );
    });
  });

  describe('refresh', () => {
    it('wirft 401 ohne Refresh-Cookie', async () => {
      await expect(service.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('Happy Path: rotiert das Refresh-Cookie und liefert einen neuen Access-Token', async () => {
      const outcome = await service.refresh(`${REFRESH_COOKIE_NAME}=alt-token`);

      expect(outcome.accessToken.accessToken).toBe('access-token');
      expect(outcome.refreshCookie).toContain(`${REFRESH_COOKIE_NAME}=refresh-token`);
      expect(oidc.refreshAccessToken).toHaveBeenCalledWith('alt-token');
    });

    it('emittiert best-effort auth.token.erneuert anhand des frisch verifizierten Access-Tokens', async () => {
      await service.refresh(`${REFRESH_COOKIE_NAME}=alt-token`);

      expect(tokenVerifier.verify).toHaveBeenCalledWith('access-token');
      expect(auditService.append).toHaveBeenCalledWith(
        expect.objectContaining({ eventTyp: AUTH_EVENT_CODES.TOKEN_ERNEUERT, actorSub: 'sub-1' }),
      );
    });

    it('überspringt den Audit-Emit still, wenn die Sub-Verifikation fehlschlägt (kein unvalidierter Akteur)', async () => {
      (tokenVerifier.verify as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));

      await expect(service.refresh(`${REFRESH_COOKIE_NAME}=alt-token`)).resolves.toBeDefined();
      expect(auditService.append).not.toHaveBeenCalledWith(
        expect.objectContaining({ eventTyp: AUTH_EVENT_CODES.TOKEN_ERNEUERT }),
      );
    });

    it('meldet 503, wenn Keycloak beim Refresh nicht erreichbar ist', async () => {
      (oidc.refreshAccessToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new OidcProviderUnavailableError('down'),
      );

      await expect(service.refresh(`${REFRESH_COOKIE_NAME}=alt-token`)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('logout', () => {
    it('ist idempotent: ohne Refresh-Cookie kein Keycloak-Call, kein Audit-Emit, trotzdem ein Delete-Cookie', async () => {
      const deleteCookie = await service.logout(undefined);

      expect(deleteCookie).toContain('Max-Age=0');
      expect(oidc.endSession).not.toHaveBeenCalled();
      expect(auditService.append).not.toHaveBeenCalled();
    });

    it('beendet die Keycloak-Session und emittiert auth.abmeldung.erfolg, wenn ein Refresh-Cookie vorhanden ist', async () => {
      const deleteCookie = await service.logout(`${REFRESH_COOKIE_NAME}=rt-1`);

      expect(oidc.endSession).toHaveBeenCalledWith('rt-1');
      expect(auditService.append).toHaveBeenCalledWith(
        expect.objectContaining({ eventTyp: AUTH_EVENT_CODES.ABMELDUNG_ERFOLG, ergebnis: 'ok' }),
      );
      expect(deleteCookie).toContain('Max-Age=0');
    });

    it('bleibt 204-idempotent, auch wenn Keycloak beim Logout nicht erreichbar ist', async () => {
      (oidc.endSession as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new OidcProviderUnavailableError('down'));

      await expect(service.logout(`${REFRESH_COOKIE_NAME}=rt-1`)).resolves.toContain('Max-Age=0');
    });
  });
});
