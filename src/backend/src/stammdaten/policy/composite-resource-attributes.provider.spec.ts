import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { CompositeResourceAttributesProvider } from './composite-resource-attributes.provider';
import type { StammdatenResourceAttributesProvider } from './stammdaten-resource-attributes.provider';
import { createFakeExecutionContext } from '../../common/interceptors/test-support/fake-execution-context';

function reflectorMock(fachaktion: string | undefined): Reflector {
  return { getAllAndOverride: vi.fn(() => fachaktion) } as unknown as Reflector;
}

describe('CompositeResourceAttributesProvider (ADR-0008 §15, D3/A5)', () => {
  it('liefert undefined OHNE den StammdatenProvider aufzurufen, wenn keine @Fachaktion() gesetzt ist (Auth-Routen, ADR-0002 unveraendert)', () => {
    const resolve = vi.fn();
    const stammdatenProvider = { resolve } as unknown as StammdatenResourceAttributesProvider;
    const composite = new CompositeResourceAttributesProvider(reflectorMock(undefined), stammdatenProvider);

    const result = composite.resolve(createFakeExecutionContext({}));

    expect(result).toBeUndefined();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('dispatcht an den StammdatenResourceAttributesProvider, wenn @Fachaktion() gesetzt ist', () => {
    const resolve = vi.fn(() => Promise.resolve({ entityTyp: 'endkunde' as const }));
    const stammdatenProvider = { resolve } as unknown as StammdatenResourceAttributesProvider;
    const composite = new CompositeResourceAttributesProvider(reflectorMock('read:stammdaten'), stammdatenProvider);

    const context = createFakeExecutionContext({});
    void composite.resolve(context);

    expect(resolve).toHaveBeenCalledWith(context);
  });
});
