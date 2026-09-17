import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FACHAKTION_KEY } from '../../common/decorators/fachaktion.decorator';
import type { PolicyAction, ResourceAttributes } from '../../auth/policy/policy-decision-port';
import type { ResourceAttributesProvider } from '../../auth/policy/resource-attributes-provider';
import { StammdatenResourceAttributesProvider } from './stammdaten-resource-attributes.provider';

/**
 * ADR-0008 §15 (D3, A5) — ersetzt am globalen `RESOURCE_ATTRIBUTES_PROVIDER`-
 * Token den `NullResourceAttributesProvider`. Dispatcht per Route-Marker
 * (`@Fachaktion(...)`): trägt eine Route KEINE `@Fachaktion(...)` (Auth-
 * Routen, ADR-0002 — unverändert), liefert dieser Composite `undefined`
 * (identisch zum bisherigen Null-Provider-Verhalten, verhaltensadditiv,
 * §25 Breaking-Changes-Gate). Trägt sie eine, wird der domänen-eigene
 * `StammdatenResourceAttributesProvider` (aus `StammdatenModule` injiziert)
 * befragt.
 *
 * DI-Ort (`backend-lead`-Votum 6, ADR-0008 §15/§29 A5): diese Bindung liegt
 * in der Kompositionswurzel `AppModule` (NICHT im `AuthModule`) — der
 * Composite injiziert den `StammdatenResourceAttributesProvider` aus dem
 * `StammdatenModule`; damit entsteht KEINE Rückwärtsabhängigkeit
 * cross-cutting → Fach-Modul (`AuthModule` kennt kein Fach-Modul).
 */
@Injectable()
export class CompositeResourceAttributesProvider implements ResourceAttributesProvider {
  constructor(
    private readonly reflector: Reflector,
    private readonly stammdatenProvider: StammdatenResourceAttributesProvider,
  ) {}

  resolve(context: ExecutionContext): Promise<ResourceAttributes | undefined> | undefined {
    const fachaktion = this.reflector.getAllAndOverride<PolicyAction | undefined>(FACHAKTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (fachaktion === undefined) {
      return undefined;
    }

    return this.stammdatenProvider.resolve(context);
  }
}
