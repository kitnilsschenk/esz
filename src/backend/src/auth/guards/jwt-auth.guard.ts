import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import { isTokenActorTyp } from '../../common/security/actor-typ';
import { SecurityLoggerService } from '../../common/logging/security-logger.service';
import type { KeycloakAccessTokenClaims } from '../jwt/keycloak-claims';
import { AccessTokenVerifierService } from '../jwt/access-token-verifier.service';
import { RolesMapperService } from '../roles/roles-mapper.service';
import { AuthConfigService } from '../auth.config';

/**
 * Globaler AuthN-Guard (ADR-0002 Teil B §11 D1), ersetzt den
 * `DenyByDefaultGuard`-Stub 1:1 als `APP_GUARD`. `@Public()` bleibt
 * unverändert respektiert (zuerst geprüft, Kurzschluss-Allow).
 *
 * Macht AUSSCHLIESSLICH AuthN (401) — KEIN AuthZ (403 liegt vollständig im
 * `PolicyInterceptor`, Konflikt A). Delegiert Signatur-/`iss`-/`exp`-
 * Validierung (Alg-Allowlist RS256/ES256, Clock-Skew 5 s) an die geteilte
 * `AccessTokenVerifierService` und prüft zusätzlich MANUELL `azp`
 * (Keycloak-Eigenheit: das Access-Token führt `aud` teils als `account` —
 * `azp` ist der verlässliche Client-Anker, s. finale Antwort "Abweichungen/
 * offene Punkte") sowie `actor_typ` FAIL-CLOSED gegen das Enum {benutzer,
 * dienstkonto} (fehlt/unbekannt -> 401, KEINE Heuristik,
 * `security-lead`-Votum 2).
 *
 * Befüllt `request.securityContext` NUR aus dem validierten Token (rote
 * Linie 1) — niemals aus Client-Input.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenVerifier: AccessTokenVerifierService,
    private readonly rolesMapper: RolesMapperService,
    private readonly config: AuthConfigService,
    private readonly securityLogger: SecurityLoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (token === undefined) {
      this.deny(request, 'kein_bearer_token');
    }

    const claims = await this.verifyToken(token, request);

    if (typeof claims.azp !== 'string' || claims.azp !== this.config.clientId) {
      this.deny(request, 'azp_mismatch');
    }

    if (claims.typ !== undefined && claims.typ !== 'Bearer') {
      this.deny(request, 'kein_access_token');
    }

    if (!isTokenActorTyp(claims.actor_typ)) {
      this.deny(request, 'actor_typ_ungueltig_oder_fehlt');
    }

    if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
      this.deny(request, 'sub_fehlt');
    }

    request.securityContext = {
      sub: claims.sub,
      actorTyp: claims.actor_typ,
      roles: this.rolesMapper.map(claims),
      azp: claims.azp,
    };

    return true;
  }

  private async verifyToken(token: string, request: AuthenticatedRequest): Promise<KeycloakAccessTokenClaims> {
    try {
      return await this.tokenVerifier.verify(token);
    } catch {
      this.deny(request, 'token_ungueltig');
    }
  }

  private extractBearerToken(request: AuthenticatedRequest): string | undefined {
    const header = request.headers.authorization;
    if (typeof header !== 'string') {
      return undefined;
    }

    const [scheme, credential] = header.split(' ');
    if (scheme === undefined || credential === undefined || credential.length === 0) {
      return undefined;
    }

    if (scheme.toLowerCase() !== 'bearer') {
      return undefined;
    }

    return credential;
  }

  /**
   * Wirft IMMER `UnauthorizedException` — 401 ist bewusst KEIN
   * `audit.event` (rote Linie 1: ohne validierten Prinzipal keine
   * Akteurs-Zuschreibung), sondern strukturiertes Security-Log
   * (`security-lead`-Votum 4).
   */
  private deny(request: AuthenticatedRequest, reasonCode: string): never {
    this.securityLogger.authenticationDenied({
      route: request.originalUrl,
      method: request.method,
      reasonCode,
      ip: request.ip,
    });

    throw new UnauthorizedException(reasonCode);
  }
}
