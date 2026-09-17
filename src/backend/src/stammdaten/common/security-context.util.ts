import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import type { SecurityContext } from '../../common/security/security-context';

/**
 * Fail-closed-Zugriff auf den vom `JwtAuthGuard` gesetzten `SecurityContext`
 * (rote Linie 1 — niemals aus Client-Input konstruieren). Sollte
 * strukturell NIE `undefined` sein (der `PolicyInterceptor` hat das bereits
 * geprüft, bevor der Handler läuft) — defensiv dennoch abgesichert, analog
 * `AuthController.session()`.
 */
export function requireSecurityContext(request: AuthenticatedRequest): SecurityContext {
  const securityContext = request.securityContext;
  if (securityContext === undefined) {
    throw new ForbiddenException('kein_security_context');
  }
  return securityContext;
}
