import { SetMetadata } from '@nestjs/common';
import type { AppRole } from '../security/app-role';

export const ROLES_KEY = 'roles';

/**
 * Grobgranulares RBAC (ADR-0002 Teil B §11/§15). Wird NICHT vom `JwtAuthGuard`
 * ausgewertet (der macht ausschließlich AuthN), sondern vom `PolicyInterceptor`
 * (Konflikt-A-Entscheidung — AuthZ läuft im Interceptor-Layer, damit `denied`
 * den `AuditActionInterceptor` erreicht, M2).
 *
 * Fehlt `@Roles(...)` auf einer nicht-`@Public()`-Route, verlangt der
 * `PolicyInterceptor` KEINE bestimmte Rolle (jeder authentisierte Prinzipal
 * darf — Default-Deny wurde bereits vom `JwtAuthGuard` durchgesetzt, s. z. B.
 * `GET /auth/session`).
 */
export const Roles = (...roles: readonly AppRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
