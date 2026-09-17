import { HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import { AccessTokenResponseDto } from './dto/access-token-response.dto';

interface ResponseMock {
  readonly response: Response;
  readonly setHeader: ReturnType<typeof vi.fn>;
  readonly redirect: ReturnType<typeof vi.fn>;
  readonly status: ReturnType<typeof vi.fn>;
}

/**
 * Liefert NEBEN dem `Response`-Test-Double auch benannte Referenzen auf die
 * einzelnen Mock-Funktionen — `expect(response.setHeader)` würde
 * `@typescript-eslint/unbound-method` auslösen (Express' `Response`-Typ
 * deklariert `setHeader`/`redirect` als Methoden, nicht als
 * funktionswertige Properties, und ist nicht unser Typ zum Anpassen); die
 * separaten Referenzen sind gewöhnliche Variablen ohne Methoden-Bindung.
 */
function createResponseMock(): ResponseMock {
  const setHeader = vi.fn();
  const redirect = vi.fn();
  const status = vi.fn();
  const response = { setHeader, redirect, status } as unknown as Response;
  return { response, setHeader, redirect, status };
}

function createRequestMock(cookie?: string): Request {
  return { headers: { cookie } } as unknown as Request;
}

/**
 * Unit-Test des DÜNNEN Controllers (`.claude/rules/backend-nestjs.md`):
 * belegt NUR die Req/Res-/Cookie-Mechanik. Die Fach-Logik (PKCE/State/
 * Nonce/Audit) ist bereits in `auth.service.spec.ts` abgedeckt — hier wird
 * `AuthService` vollständig gemockt.
 */
describe('AuthController (dünn — nur Req/Res/Cookies)', () => {
  it('GET /auth/login setzt den Vor-Auth-Cookie und leitet mit 302 weiter', async () => {
    const buildLoginRedirect = vi.fn(() =>
      Promise.resolve({ location: 'https://keycloak/auth', authTxCookie: 'cookie-a' }),
    );
    const authService = { buildLoginRedirect } as unknown as AuthService;
    const controller = new AuthController(authService);
    const { response, setHeader, redirect } = createResponseMock();

    await controller.login(response);

    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', 'cookie-a');
    expect(redirect).toHaveBeenCalledWith(HttpStatus.FOUND, 'https://keycloak/auth');
  });

  it('GET /auth/callback setzt Refresh- + Delete-Cookie und leitet ins feste SPA-Ziel weiter', async () => {
    const handleCallback = vi.fn(() =>
      Promise.resolve({ location: '/', refreshCookie: 'rt-cookie', clearAuthTxCookie: 'delete-cookie' }),
    );
    const authService = { handleCallback } as unknown as AuthService;
    const controller = new AuthController(authService);
    const { response, setHeader, redirect } = createResponseMock();
    const request = createRequestMock('__Host-edms_auth_tx=xyz');

    await controller.callback({ state: 's', code: 'c' }, request, response);

    expect(handleCallback).toHaveBeenCalledWith({ state: 's', code: 'c' }, '__Host-edms_auth_tx=xyz');
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', ['rt-cookie', 'delete-cookie']);
    expect(redirect).toHaveBeenCalledWith(HttpStatus.FOUND, '/');
  });

  it('POST /auth/refresh liefert den Access-Token und rotiert das Refresh-Cookie', async () => {
    const accessToken = new AccessTokenResponseDto('at', 300);
    const refresh = vi.fn(() => Promise.resolve({ accessToken, refreshCookie: 'rotated-cookie' }));
    const authService = { refresh } as unknown as AuthService;
    const controller = new AuthController(authService);
    const { response, setHeader } = createResponseMock();
    const request = createRequestMock('__Host-edms_rt=alt');

    const result = await controller.refresh(request, response);

    expect(result).toBe(accessToken);
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', 'rotated-cookie');
  });

  it('POST /auth/logout löscht das Refresh-Cookie (idempotent, kein Body)', async () => {
    const logout = vi.fn(() => Promise.resolve('delete-cookie'));
    const authService = { logout } as unknown as AuthService;
    const controller = new AuthController(authService);
    const { response, setHeader } = createResponseMock();
    const request = createRequestMock('__Host-edms_rt=x');

    await controller.logout(request, response);

    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', 'delete-cookie');
  });

  it('GET /auth/session liefert die SessionInfo aus dem validierten SecurityContext', () => {
    const controller = new AuthController({} as AuthService);
    const request = { securityContext: { sub: 'sub-1', actorTyp: 'benutzer', roles: ['betrieb'], azp: 'edms-bff' } };

    const session = controller.session(request as never);

    expect(session).toEqual({ sub: 'sub-1', actorTyp: 'benutzer', roles: ['betrieb'] });
  });

  it('GET /auth/session wirft 401, wenn (strukturell unerwartet) kein SecurityContext vorliegt', () => {
    const controller = new AuthController({} as AuthService);
    expect(() => controller.session({} as never)).toThrow();
  });
});
