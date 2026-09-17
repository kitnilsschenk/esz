import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PolicyInterceptor } from './policy.interceptor';
import { createFakeCallHandler, createFakeExecutionContext } from './test-support/fake-execution-context';
import type { PolicyDecisionPort } from '../../auth/policy/policy-decision-port';
import type { ResourceAttributesProvider } from '../../auth/policy/resource-attributes-provider';
import type { SecurityContext } from '../security/security-context';

function createReflectorMock(overrides: {
  isPublic?: boolean;
  roles?: readonly string[];
  fachaktion?: string;
}): Reflector {
  return {
    getAllAndOverride: vi.fn((key: string) => {
      if (key === 'isPublic') {
        return overrides.isPublic;
      }
      if (key === 'roles') {
        return overrides.roles;
      }
      if (key === 'fachaktion') {
        return overrides.fachaktion;
      }
      return undefined;
    }),
  } as unknown as Reflector;
}

const securityContext: SecurityContext = {
  sub: 'sub-1',
  actorTyp: 'benutzer',
  roles: ['betrieb'],
  azp: 'edms-bff',
};

describe('PolicyInterceptor (ADR-0002 Teil B §11/§15, Konflikt A)', () => {
  it('lässt @Public()-Routen ohne PDP-Aufruf durch', async () => {
    const pdp: PolicyDecisionPort = { evaluate: vi.fn() };
    const provider: ResourceAttributesProvider = { resolve: vi.fn() };
    const interceptor = new PolicyInterceptor(createReflectorMock({ isPublic: true }), pdp, provider);
    const context = createFakeExecutionContext({ method: 'GET' });

    const result = await firstValueFrom(interceptor.intercept(context, createFakeCallHandler('ok')));

    expect(result).toBe('ok');
    expect(pdp.evaluate).not.toHaveBeenCalled();
  });

  it('wirft ForbiddenException("kein_security_context"), wenn kein SecurityContext gesetzt ist (fail-closed)', async () => {
    const pdp: PolicyDecisionPort = { evaluate: vi.fn() };
    const provider: ResourceAttributesProvider = { resolve: vi.fn() };
    const interceptor = new PolicyInterceptor(createReflectorMock({ isPublic: false }), pdp, provider);
    const context = createFakeExecutionContext({ method: 'GET' });

    await expect(
      firstValueFrom(interceptor.intercept(context, createFakeCallHandler('ok'))),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('wirft ForbiddenException("rolle_fehlt"), wenn @Roles() nicht erfüllt ist', async () => {
    const pdp: PolicyDecisionPort = { evaluate: vi.fn() };
    const provider: ResourceAttributesProvider = { resolve: vi.fn(() => Promise.resolve(undefined)) };
    const interceptor = new PolicyInterceptor(
      createReflectorMock({ isPublic: false, roles: ['admin'] }),
      pdp,
      provider,
    );
    const context = createFakeExecutionContext({ method: 'GET', securityContext });

    await expect(
      firstValueFrom(interceptor.intercept(context, createFakeCallHandler('ok'))),
    ).rejects.toMatchObject({ message: 'rolle_fehlt' });
  });

  it('erlaubt bei erfüllter @Roles()-Prüfung und ruft den PDP mit der abgeleiteten Aktion auf', async () => {
    const pdp: PolicyDecisionPort = {
      evaluate: vi.fn(() => ({ effect: 'permit' as const, reason: 'default_permit_v1' as const })),
    };
    const provider: ResourceAttributesProvider = { resolve: vi.fn(() => Promise.resolve(undefined)) };
    const interceptor = new PolicyInterceptor(
      createReflectorMock({ isPublic: false, roles: ['betrieb', 'admin'] }),
      pdp,
      provider,
    );
    const context = createFakeExecutionContext({ method: 'POST', securityContext });

    const result = await firstValueFrom(interceptor.intercept(context, createFakeCallHandler('ok')));

    expect(result).toBe('ok');
    expect(pdp.evaluate).toHaveBeenCalledWith(securityContext, 'write', undefined);
  });

  it('ADR-0008 §14 (D2): @Fachaktion() hat Vorrang vor der Methoden-Ableitung', async () => {
    const pdp: PolicyDecisionPort = {
      evaluate: vi.fn(() => ({ effect: 'permit' as const, reason: 'default_permit_v1' as const })),
    };
    const provider: ResourceAttributesProvider = { resolve: vi.fn(() => Promise.resolve(undefined)) };
    const interceptor = new PolicyInterceptor(
      createReflectorMock({ isPublic: false, fachaktion: 'read:stammdaten' }),
      pdp,
      provider,
    );
    // GET würde ohne @Fachaktion() auf 'read' abgebildet — der Decorator
    // überschreibt das mit der feingranularen Fachaktion.
    const context = createFakeExecutionContext({ method: 'GET', securityContext });

    await firstValueFrom(interceptor.intercept(context, createFakeCallHandler('ok')));

    expect(pdp.evaluate).toHaveBeenCalledWith(securityContext, 'read:stammdaten', undefined);
  });

  it('wirft ForbiddenException mit dem PDP-Grund, wenn der PDP ablehnt (M2: denied auditierbar)', async () => {
    const pdp: PolicyDecisionPort = {
      evaluate: vi.fn(() => ({ effect: 'deny' as const, reason: 'auswertung_ausgenommen' as const })),
    };
    const provider: ResourceAttributesProvider = {
      resolve: vi.fn(() => Promise.resolve({ datenklasse: 'detailverbrauch' as const })),
    };
    const interceptor = new PolicyInterceptor(createReflectorMock({ isPublic: false }), pdp, provider);
    const context = createFakeExecutionContext({ method: 'GET', securityContext });

    await expect(
      firstValueFrom(interceptor.intercept(context, createFakeCallHandler('ok'))),
    ).rejects.toMatchObject({ message: 'auswertung_ausgenommen' });
  });
});
