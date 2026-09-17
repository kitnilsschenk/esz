import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuditActionInterceptor } from './audit-action.interceptor';
import {
  createFailingCallHandler,
  createFakeCallHandler,
  createFakeExecutionContext,
} from './test-support/fake-execution-context';
import type { AuditActionMetadata } from '../decorators/audit-action.decorator';
import type { AuditService } from '../../audit/audit.service';
import type { SecurityContext } from '../security/security-context';

function createReflectorMock(metadata: AuditActionMetadata | undefined): Reflector {
  return { getAllAndOverride: vi.fn(() => metadata) } as unknown as Reflector;
}

const securityContext: SecurityContext = {
  sub: 'sub-1',
  actorTyp: 'benutzer',
  roles: ['betrieb'],
  azp: 'edms-bff',
};

describe('AuditActionInterceptor (ADR-0002 §15, ADR-0003 §17.2)', () => {
  it('reicht den Erfolgsfall auf Routen ohne @AuditAction() unauditiert durch', async () => {
    const auditService = { append: vi.fn() } as unknown as AuditService;
    const interceptor = new AuditActionInterceptor(createReflectorMock(undefined), auditService);
    const context = createFakeExecutionContext({ securityContext });

    const result = await firstValueFrom(interceptor.intercept(context, createFakeCallHandler('wert')));

    expect(result).toBe('wert');
    expect(auditService.append).not.toHaveBeenCalled();
  });

  it('M2-Fallback: emittiert authz.zugriff.verweigert bei ForbiddenException auf Routen OHNE @AuditAction()', async () => {
    const append = vi.fn(() => Promise.resolve(undefined));
    const auditService = { append } as unknown as AuditService;
    const interceptor = new AuditActionInterceptor(createReflectorMock(undefined), auditService);
    const context = createFakeExecutionContext({
      securityContext: { ...securityContext, roles: ['betrieb', 'admin'] },
      route: { path: '/stammdaten/kunde/:id' },
    });
    const forbidden = new ForbiddenException('rolle_fehlt');

    await expect(firstValueFrom(interceptor.intercept(context, createFailingCallHandler(forbidden)))).rejects.toBe(
      forbidden,
    );

    expect(append).toHaveBeenCalledWith({
      eventTyp: 'authz.zugriff.verweigert',
      actorTyp: 'benutzer',
      actorSub: 'sub-1',
      ergebnis: 'denied',
      actorRolle: 'betrieb,admin',
      kontext: { grund: 'policy_ablehnung_ausserhalb_auditaction', route_muster: '/stammdaten/kunde/:id' },
    });
  });

  it('M2-Fallback: nutzt "unbekannt" als route_muster, wenn keine Express-Routenvorlage vorliegt', async () => {
    const append = vi.fn(() => Promise.resolve(undefined));
    const auditService = { append } as unknown as AuditService;
    const interceptor = new AuditActionInterceptor(createReflectorMock(undefined), auditService);
    const context = createFakeExecutionContext({ securityContext });
    const forbidden = new ForbiddenException('rolle_fehlt');

    await expect(
      firstValueFrom(interceptor.intercept(context, createFailingCallHandler(forbidden))),
    ).rejects.toBe(forbidden);

    expect(append).toHaveBeenCalledWith({
      eventTyp: 'authz.zugriff.verweigert',
      actorTyp: 'benutzer',
      actorSub: 'sub-1',
      ergebnis: 'denied',
      actorRolle: 'betrieb',
      kontext: { grund: 'policy_ablehnung_ausserhalb_auditaction', route_muster: 'unbekannt' },
    });
  });

  it('M2-Fallback: rote Linie 1 — kein Emit ohne SecurityContext (dennoch Rethrow)', async () => {
    const append = vi.fn(() => Promise.resolve(undefined));
    const auditService = { append } as unknown as AuditService;
    const interceptor = new AuditActionInterceptor(createReflectorMock(undefined), auditService);
    const context = createFakeExecutionContext({});
    const forbidden = new ForbiddenException('kein_security_context');

    await expect(
      firstValueFrom(interceptor.intercept(context, createFailingCallHandler(forbidden))),
    ).rejects.toBe(forbidden);

    expect(append).not.toHaveBeenCalled();
  });

  it('M2-Fallback greift NUR bei ForbiddenException — sonstige Fehler auf nicht-dekorierten Routen bleiben unauditiert', async () => {
    const append = vi.fn(() => Promise.resolve(undefined));
    const auditService = { append } as unknown as AuditService;
    const interceptor = new AuditActionInterceptor(createReflectorMock(undefined), auditService);
    const context = createFakeExecutionContext({ securityContext });
    const boom = new Error('kaputt, aber keine AuthZ-Entscheidung');

    await expect(firstValueFrom(interceptor.intercept(context, createFailingCallHandler(boom)))).rejects.toBe(boom);

    expect(append).not.toHaveBeenCalled();
  });

  it('emittiert "ok" bei Erfolg', async () => {
    const auditService = { append: vi.fn(() => Promise.resolve(undefined)) } as unknown as AuditService;
    const metadata: AuditActionMetadata = { eventTyp: 'test.objekt.erstellt' };
    const interceptor = new AuditActionInterceptor(createReflectorMock(metadata), auditService);
    const context = createFakeExecutionContext({ securityContext });

    await firstValueFrom(interceptor.intercept(context, createFakeCallHandler('wert')));

    expect(auditService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventTyp: 'test.objekt.erstellt',
        ergebnis: 'ok',
        actorSub: 'sub-1',
        actorTyp: 'benutzer',
      }),
    );
  });

  it('emittiert "denied" bei ForbiddenException UND wirft den Fehler weiter (Konflikt A)', async () => {
    const auditService = { append: vi.fn(() => Promise.resolve(undefined)) } as unknown as AuditService;
    const metadata: AuditActionMetadata = { eventTyp: 'test.objekt.erstellt' };
    const interceptor = new AuditActionInterceptor(createReflectorMock(metadata), auditService);
    const context = createFakeExecutionContext({ securityContext });
    const forbidden = new ForbiddenException('rolle_fehlt');

    await expect(firstValueFrom(interceptor.intercept(context, createFailingCallHandler(forbidden)))).rejects.toBe(
      forbidden,
    );

    expect(auditService.append).toHaveBeenCalledWith(expect.objectContaining({ ergebnis: 'denied' }));
  });

  it('emittiert "error" bei sonstigen Fehlern UND wirft weiter', async () => {
    const auditService = { append: vi.fn(() => Promise.resolve(undefined)) } as unknown as AuditService;
    const metadata: AuditActionMetadata = { eventTyp: 'test.objekt.erstellt' };
    const interceptor = new AuditActionInterceptor(createReflectorMock(metadata), auditService);
    const context = createFakeExecutionContext({ securityContext });
    const boom = new Error('kaputt');

    await expect(firstValueFrom(interceptor.intercept(context, createFailingCallHandler(boom)))).rejects.toBe(boom);
    expect(auditService.append).toHaveBeenCalledWith(expect.objectContaining({ ergebnis: 'error' }));
  });

  it('rote Linie 1: unterdrückt den Emit vollständig, wenn kein SecurityContext vorhanden ist', async () => {
    const auditService = { append: vi.fn(() => Promise.resolve(undefined)) } as unknown as AuditService;
    const metadata: AuditActionMetadata = { eventTyp: 'test.objekt.erstellt' };
    const interceptor = new AuditActionInterceptor(createReflectorMock(metadata), auditService);
    const context = createFakeExecutionContext({});

    const result = await firstValueFrom(interceptor.intercept(context, createFakeCallHandler('wert')));

    expect(result).toBe('wert');
    expect(auditService.append).not.toHaveBeenCalled();
  });

  it('nutzt objektRefExtractor und kontextExtractors typisiert (rote Linie 2)', async () => {
    const auditService = { append: vi.fn(() => Promise.resolve(undefined)) } as unknown as AuditService;
    const metadata: AuditActionMetadata<{ id: string }> = {
      eventTyp: 'test.objekt.erstellt',
      objektRefExtractor: ({ result }) => result?.id,
      kontextExtractors: { grund: () => 'manuell' },
    };
    const interceptor = new AuditActionInterceptor(
      createReflectorMock(metadata as AuditActionMetadata),
      auditService,
    );
    const context = createFakeExecutionContext({ securityContext });

    await firstValueFrom(interceptor.intercept(context, createFakeCallHandler({ id: 'obj-1' })));

    expect(auditService.append).toHaveBeenCalledWith(
      expect.objectContaining({ objektRef: 'obj-1', kontext: { grund: 'manuell' } }),
    );
  });
});
