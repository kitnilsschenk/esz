import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import { AuthConfigService } from '../auth.config';

/**
 * CSRF-Abwehr für `/auth/refresh` und `/auth/logout` (ADR-0002 Teil B §12,
 * `security-lead`-Votum 3): `SameSite=Strict` auf `__Host-edms_rt` deckt
 * Standard-Browser bereits ab; dieser Guard ist die zusätzliche,
 * SERVERSEITIGE `Origin`-Allowlist-Prüfung — bewusst KEIN Double-Submit-
 * Token. Der `Origin`-Header ist ein vom Browser gesetzter "Forbidden
 * Header Name" (per JS nicht fälschbar); genau deshalb wird er NICHT als
 * OpenAPI-Request-Parameter modelliert (`auth.openapi.yaml`-Kopfkommentar,
 * F3 — "required vs. fehlt->403"-Widerspruch aufgelöst).
 *
 * Voraussetzung (separat, außerhalb dieses Codes zu verifizieren): die
 * CORS-Konfiguration für `/auth/refresh`/`/auth/logout` spiegelt den Origin
 * NIE mit `Access-Control-Allow-Credentials` zurück (keine Origin-
 * Reflexion) — s. finale Antwort "Abweichungen/offene Punkte".
 *
 * Lokal per `@UseGuards()` auf den betroffenen Controller-Methoden
 * angewendet, bewusst NICHT global (Scope-Entscheidung).
 */
@Injectable()
export class OriginAllowlistGuard implements CanActivate {
  constructor(private readonly config: AuthConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const origin = request.headers.origin;

    if (typeof origin !== 'string' || !this.config.allowedOrigins.includes(origin)) {
      throw new ForbiddenException('origin_nicht_erlaubt');
    }

    return true;
  }
}
