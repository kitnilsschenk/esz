import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { OriginAllowlistGuard } from './origin-allowlist.guard';
import { AuthConfigService } from '../auth.config';

function setRequiredEnv(): void {
  process.env['KEYCLOAK_ISSUER_URL'] = 'http://localhost:8080/realms/edms';
  process.env['OIDC_CLIENT_ID'] = 'edms-bff';
  process.env['EDMS_BFF_CLIENT_SECRET'] = 'test-secret';
  process.env['OIDC_REDIRECT_URI'] = 'http://localhost:3000/auth/callback';
  process.env['AUTH_ALLOWED_ORIGINS'] = 'http://localhost:3000';
}

function contextWithOrigin(origin: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { origin } }) }),
  } as unknown as ExecutionContext;
}

describe('OriginAllowlistGuard (CSRF, ADR-0002 Teil B §12, security-lead-Votum 3)', () => {
  let guard: OriginAllowlistGuard;

  beforeEach(() => {
    setRequiredEnv();
    guard = new OriginAllowlistGuard(new AuthConfigService());
  });

  it('erlaubt einen Origin aus der Allowlist', () => {
    expect(guard.canActivate(contextWithOrigin('http://localhost:3000'))).toBe(true);
  });

  it('lehnt einen fremden Origin mit 403 ab', () => {
    expect(() => guard.canActivate(contextWithOrigin('https://boese-seite.example'))).toThrow(ForbiddenException);
  });

  it('lehnt einen fehlenden Origin-Header mit 403 ab', () => {
    expect(() => guard.canActivate(contextWithOrigin(undefined))).toThrow(ForbiddenException);
  });
});
