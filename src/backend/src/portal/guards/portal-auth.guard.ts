import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { parseCookieHeader } from '../../auth/cookies/cookie.util';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import { PortalAnmeldungService } from '../portal-anmeldung.service';

/** `__Host-`-Präfix: erzwingt browserseitig Secure + Path=/ + keine `Domain` (kein Subdomain-Cookie). */
export const PORTAL_SITZUNG_COOKIE = '__Host-edms_portal';

/**
 * Der Türsteher des Nutzerportals.
 *
 * **Warum ein eigener Guard neben `JwtAuthGuard`.** Ein Endkunde hat kein
 * Keycloak-Token, keine Rolle und keine ABAC-Fachaktion — er hat eine
 * Portal-Sitzung. Die Betriebs-Kette (`JwtAuthGuard` → `PolicyInterceptor`)
 * ist auf Mitarbeiter zugeschnitten; einen Endkunden dort hineinzureichen
 * hieße, ihn zu einem Benutzer mit Rollen zu erklären, den es nicht gibt.
 *
 * Die Portal-Routen sind deshalb `@Public()` gegenüber dem globalen
 * AuthN-Guard (kein Bearer-Token) und werden HIER geschützt. Das ist keine
 * Lücke, sondern eine zweite, engere Tür: `@Public()` heißt „kein
 * Keycloak-Token nötig", nicht „offen".
 *
 * **Der Guard setzt `request.portalKunde` ausschließlich aus der aufgelösten
 * Sitzung** — nie aus Client-Input (rote Linie 1). Jede Route dahinter liest
 * die Endkunden-Kennung von dort und nimmt sie NICHT aus dem Pfad entgegen:
 * Sonst wäre der Zugriff auf fremde Daten eine Frage der URL.
 */
@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(private readonly anmeldungService: PortalAnmeldungService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = parseCookieHeader(request.headers.cookie)[PORTAL_SITZUNG_COOKIE];

    if (token === undefined || token.length === 0) {
      throw new UnauthorizedException('Keine Portal-Sitzung.');
    }

    const sitzung = await this.anmeldungService.findeSitzung(token);
    if (sitzung === undefined) {
      // Eine Sitzung kann abgelaufen, abgemeldet, gesperrt ODER an einem
      // inzwischen gesperrten Endkunden hängen. Nach außen ist das
      // dasselbe — s. `PortalAnmeldungService`-Doc.
      throw new UnauthorizedException('Portal-Sitzung ungueltig oder abgelaufen.');
    }

    request.portalKunde = {
      zugangId: sitzung.zugangId,
      endkundeId: sitzung.endkundeId,
      kennung: sitzung.kennung,
    };
    return true;
  }
}

/**
 * Liest den angemeldeten Endkunden aus dem Request — fail-closed.
 *
 * Wirft, wenn der Guard nicht gelaufen ist. Das ist Absicht: Eine Route, die
 * den Guard vergisst, soll scheitern und nicht mit `undefined` weiterarbeiten
 * — sonst entstünde genau dort ein ungeschützter Zugriff, wo jemand einen
 * Decorator vergessen hat. Dasselbe Muster wie `requireSecurityContext`.
 */
export function requirePortalKunde(request: AuthenticatedRequest): {
  readonly zugangId: string;
  readonly endkundeId: string;
  readonly kennung: string;
} {
  const kunde = request.portalKunde;
  if (kunde === undefined) {
    throw new UnauthorizedException('Keine Portal-Sitzung im Request — PortalAuthGuard nicht aktiv?');
  }
  return kunde;
}
