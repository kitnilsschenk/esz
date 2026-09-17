import { ForbiddenException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SyntheticOnlyInterceptor } from './synthetic-only.interceptor';
import type { SyntheticOnlyConfigService } from './synthetic-only.config';
import { createFakeCallHandler, createFakeExecutionContext } from '../../common/interceptors/test-support/fake-execution-context';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';

function fakeConfig(syntheticOnly: boolean): SyntheticOnlyConfigService {
  return { syntheticOnly, envClass: 'dev' } as unknown as SyntheticOnlyConfigService;
}

describe('SyntheticOnlyInterceptor (ADR-0008 §22, D10)', () => {
  it('setzt request.synthetic=true und lässt den Request durch, wenn EDMS_SYNTHETIC_ONLY=true', async () => {
    const request = {} as AuthenticatedRequest;
    const interceptor = new SyntheticOnlyInterceptor(fakeConfig(true));
    const context = createFakeExecutionContext(request);

    const result = await firstValueFrom(interceptor.intercept(context, createFakeCallHandler('ok')));

    expect(result).toBe('ok');
    expect(request.synthetic).toBe(true);
  });

  it('sperrt fail-closed (ForbiddenException), wenn EDMS_SYNTHETIC_ONLY=false', () => {
    const request = {} as AuthenticatedRequest;
    const interceptor = new SyntheticOnlyInterceptor(fakeConfig(false));
    const context = createFakeExecutionContext(request);

    expect(() => interceptor.intercept(context, createFakeCallHandler('ok'))).toThrow(ForbiddenException);
    // Gesperrter Pfad darf request.synthetic NICHT setzen.
    expect(request.synthetic).toBeUndefined();
  });
});
