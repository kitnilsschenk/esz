import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AccessTokenVerificationError, AccessTokenVerifierService } from '../jwt/access-token-verifier.service';
import type { KeycloakAccessTokenClaims } from '../jwt/keycloak-claims';
import { RolesMapperService } from '../roles/roles-mapper.service';
import { AuthConfigService } from '../auth.config';
import { SecurityLoggerService } from '../../common/logging/security-logger.service';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';

function setRequiredEnv(): void {
  process.env['KEYCLOAK_ISSUER_URL'] = 'http://localhost:8080/realms/edms';
  process.env['OIDC_CLIENT_ID'] = 'edms-bff';
  process.env['EDMS_BFF_CLIENT_SECRET'] = 'test-secret';
  process.env['OIDC_REDIRECT_URI'] = 'http://localhost:3000/auth/callback';
}

function createContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (): void => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function createReflectorMock(isPublic: boolean | undefined): Reflector {
  return { getAllAndOverride: vi.fn(() => isPublic) } as unknown as Reflector;
}

describe('JwtAuthGuard (ADR-0002 Teil B §11, D1)', () => {
  let config: AuthConfigService;
  let rolesMapper: RolesMapperService;
  let securityLogger: SecurityLoggerService;

  beforeEach(() => {
    setRequiredEnv();
    config = new AuthConfigService();
    rolesMapper = { map: vi.fn(() => ['betrieb']) } as unknown as RolesMapperService;
    securityLogger = { authenticationDenied: vi.fn() } as unknown as SecurityLoggerService;
  });

  function createGuard(verifyImpl: (token: string) => Promise<KeycloakAccessTokenClaims>): JwtAuthGuard {
    const tokenVerifier = { verify: vi.fn(verifyImpl) } as unknown as AccessTokenVerifierService;
    return new JwtAuthGuard(createReflectorMock(false), tokenVerifier, rolesMapper, config, securityLogger);
  }

  it('lässt @Public()-Routen ohne Token-Prüfung durch', async () => {
    const tokenVerifier = { verify: vi.fn() } as unknown as AccessTokenVerifierService;
    const guard = new JwtAuthGuard(createReflectorMock(true), tokenVerifier, rolesMapper, config, securityLogger);
    const request: Partial<AuthenticatedRequest> = {};

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(tokenVerifier.verify).not.toHaveBeenCalled();
  });

  it('lehnt fehlenden Authorization-Header mit 401 ab und loggt strukturiert', async () => {
    const guard = createGuard(() => Promise.reject(new Error('sollte nicht aufgerufen werden')));
    const request: Partial<AuthenticatedRequest> = { headers: {}, method: 'GET', originalUrl: '/auth/session' };

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(securityLogger.authenticationDenied).toHaveBeenCalledWith(
      expect.objectContaining({ reasonCode: 'kein_bearer_token' }),
    );
  });

  it('lehnt einen nicht-Bearer-Header ab', async () => {
    const guard = createGuard(() => Promise.reject(new Error('sollte nicht aufgerufen werden')));
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Basic xyz' },
      method: 'GET',
      originalUrl: '/x',
    };

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lehnt ab, wenn die Token-Verifikation fehlschlägt', async () => {
    const guard = createGuard(() => Promise.reject(new AccessTokenVerificationError('signatur ungueltig')));
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer abc.def.ghi' },
      method: 'GET',
      originalUrl: '/x',
    };

    await expect(guard.canActivate(createContext(request))).rejects.toMatchObject({ message: 'token_ungueltig' });
  });

  it('lehnt ab bei azp-Mismatch (Keycloak-aud-Eigenheit — azp ist der verlässliche Anker)', async () => {
    const guard = createGuard(() => Promise.resolve({ sub: 'sub-1', azp: 'ein-anderer-client', actor_typ: 'benutzer' }));
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer abc' },
      method: 'GET',
      originalUrl: '/x',
    };

    await expect(guard.canActivate(createContext(request))).rejects.toMatchObject({ message: 'azp_mismatch' });
  });

  it('lehnt ab bei fehlendem/unbekanntem actor_typ FAIL-CLOSED (rote Linie, security-lead-Votum 2)', async () => {
    const guard = createGuard(() => Promise.resolve({ sub: 'sub-1', azp: 'edms-bff' }));
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer abc' },
      method: 'GET',
      originalUrl: '/x',
    };

    await expect(guard.canActivate(createContext(request))).rejects.toMatchObject({
      message: 'actor_typ_ungueltig_oder_fehlt',
    });
  });

  it('lehnt ab bei actor_typ="system" (kein gültiger Token-Claim-Wert)', async () => {
    const guard = createGuard(() => Promise.resolve({ sub: 'sub-1', azp: 'edms-bff', actor_typ: 'system' }));
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer abc' },
      method: 'GET',
      originalUrl: '/x',
    };

    await expect(guard.canActivate(createContext(request))).rejects.toMatchObject({
      message: 'actor_typ_ungueltig_oder_fehlt',
    });
  });

  it('lehnt ab, wenn typ vorhanden aber != Bearer ist (ID-Token-als-Access-Token-Schutz)', async () => {
    const guard = createGuard(() => Promise.resolve({ sub: 'sub-1', azp: 'edms-bff', actor_typ: 'benutzer', typ: 'ID' }));
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer abc' },
      method: 'GET',
      originalUrl: '/x',
    };

    await expect(guard.canActivate(createContext(request))).rejects.toMatchObject({ message: 'kein_access_token' });
  });

  it('befüllt bei vollständig validiertem Token den securityContext NUR aus dem Token', async () => {
    const guard = createGuard(() => Promise.resolve({
      sub: 'sub-1',
      azp: 'edms-bff',
      actor_typ: 'benutzer',
      realm_access: { roles: ['betrieb'] },
    }));
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer abc' },
      method: 'GET',
      originalUrl: '/x',
    };
    const context = createContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.securityContext).toEqual({
      sub: 'sub-1',
      actorTyp: 'benutzer',
      roles: ['betrieb'],
      azp: 'edms-bff',
    });
    expect(rolesMapper.map).toHaveBeenCalled();
  });
});
