import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { from, switchMap } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { FACHAKTION_KEY } from '../decorators/fachaktion.decorator';
import type { AppRole } from '../security/app-role';
import type { AuthenticatedRequest } from '../security/authenticated-request';
import { POLICY_DECISION_PORT, RESOURCE_ATTRIBUTES_PROVIDER } from '../../auth/policy/policy.constants';
import type { PolicyAction, PolicyDecisionPort } from '../../auth/policy/policy-decision-port';
import type { ResourceAttributesProvider } from '../../auth/policy/resource-attributes-provider';

const METHOD_ACTION_MAP: Readonly<Record<string, PolicyAction>> = {
  GET: 'read',
  HEAD: 'read',
  POST: 'write',
  PUT: 'write',
  PATCH: 'write',
  DELETE: 'delete',
};

/**
 * Innerster globaler Interceptor (ADR-0002 Teil B §11/§15, Konflikt A).
 * Führt die GESAMTE Autorisierung aus — grobgranulares RBAC (`@Roles`) UND
 * feingranulares ABAC (`PolicyDecisionPort`) — NICHT der Guard (der macht
 * ausschließlich AuthN, s. `JwtAuthGuard`). Eine Denial wirft
 * `ForbiddenException`, die für `AuditActionInterceptor.catchError`
 * (außen in der Kette) sichtbar ist — genau das war der strukturelle Grund
 * für die Verlagerung aus dem Guard (Guard-Denials erreichen keinen
 * Interceptor, M2 wäre sonst unerfüllbar).
 *
 * `@Public()`-Routen werden übersprungen (kein `SecurityContext` vorhanden,
 * da der `JwtAuthGuard` dort gar nicht validiert). Routen OHNE `@Roles(...)`
 * verlangen keine bestimmte Rolle — Default-Deny wurde bereits von der
 * AuthN-Schicht durchgesetzt (jeder authentisierte Prinzipal darf, z. B.
 * `GET /auth/session`); Default bleibt dennoch strukturell "deny", weil ohne
 * validierten `SecurityContext` (der eigentlich nie fehlen sollte) hart
 * abgelehnt wird.
 */
@Injectable()
export class PolicyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(POLICY_DECISION_PORT) private readonly pdp: PolicyDecisionPort,
    @Inject(RESOURCE_ATTRIBUTES_PROVIDER) private readonly resourceAttributesProvider: ResourceAttributesProvider,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic === true) {
      return next.handle();
    }

    return from(this.authorize(context)).pipe(switchMap(() => next.handle()));
  }

  private async authorize(context: ExecutionContext): Promise<void> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const securityContext = request.securityContext;

    if (securityContext === undefined) {
      // Sollte strukturell nicht vorkommen (JwtAuthGuard lässt nur @Public()
      // oder vollständig validierte Requests durch) — fail-closed defensiv.
      throw new ForbiddenException('kein_security_context');
    }

    const requiredRoles = this.reflector.getAllAndOverride<readonly AppRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles !== undefined && requiredRoles.length > 0) {
      const hasRole = requiredRoles.some((role) => securityContext.roles.includes(role));
      if (!hasRole) {
        throw new ForbiddenException('rolle_fehlt');
      }
    }

    const resource = await this.resourceAttributesProvider.resolve(context);
    // ADR-0008 §14 (D2, Entscheidung (a)): `@Fachaktion(...)` hat Vorrang vor
    // der groben Methoden-Ableitung — `getAllAndOverride([handler, class])`
    // konsistent zu ROLES_KEY/AUDIT_ACTION_KEY/IS_PUBLIC_KEY/SKIP_TRANSACTION_KEY
    // (`backend-lead`-Votum 8). Routen ohne Decorator (Auth-Routen, ADR-0002)
    // fallen unverändert auf `METHOD_ACTION_MAP` zurück.
    const fachaktion = this.reflector.getAllAndOverride<PolicyAction | undefined>(FACHAKTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const action = fachaktion ?? METHOD_ACTION_MAP[request.method] ?? 'read';
    const decision = await this.pdp.evaluate(securityContext, action, resource);

    if (decision.effect === 'deny') {
      throw new ForbiddenException(decision.reason);
    }
  }
}
