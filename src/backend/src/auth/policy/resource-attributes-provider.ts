import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { ResourceAttributes } from './policy-decision-port';

/**
 * Erweiterungspunkt für künftige Fach-Module: liefert (falls vorhanden) die
 * ABAC-Ressourcen-Attribute (ADR-0004 §13.2) für die aktuelle Route.
 *
 * v1 hat KEINEN Fach-Endpoint, der reale Attribute liefert (A2, ADR-0002).
 * Der `NullResourceAttributesProvider` ist der Default-Binding im
 * `PolicyModule`/`AuthModule` und liefert immer `undefined` — ABAC bleibt
 * strukturell vorhanden (unit-testbar, M6), aber materiell wirkungslos, bis
 * ein Fach-Modul einen eigenen Provider unter diesem Token bindet.
 *
 * Funktionswertige PROPERTY (statt Methoden-Kurzschreibweise) — vermeidet
 * `@typescript-eslint/unbound-method`-Rauschen beim Mocken in Tests.
 */
export interface ResourceAttributesProvider {
  readonly resolve: (
    context: ExecutionContext,
  ) => ResourceAttributes | undefined | Promise<ResourceAttributes | undefined>;
}

@Injectable()
export class NullResourceAttributesProvider implements ResourceAttributesProvider {
  resolve(): undefined {
    return undefined;
  }
}
