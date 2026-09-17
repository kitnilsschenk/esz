import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { buildDeleteHostCookie, buildHostCookie, parseCookieHeader } from '../auth/cookies/cookie.util';
import type { AuthenticatedRequest } from '../common/security/authenticated-request';
import { PortalAnmeldungDto, PortalEinloesenDto } from './dto/portal-anmeldung.dto';
import { PORTAL_SITZUNG_COOKIE, PortalAuthGuard, requirePortalKunde } from './guards/portal-auth.guard';
import { PortalAnmeldungService } from './portal-anmeldung.service';
import type { PortalSitzungErgebnis } from './portal-anmeldung.service';
import type { PortalIchAntwort } from './portal.types';

/** Antwort auf eine erfolgreiche Anmeldung — OHNE das Token (das liegt im Cookie). */
interface PortalAnmeldungAntwort {
  readonly kennung: string;
  readonly laeuftAbAt: string;
}

/**
 * `/portal/auth/*` — der Anmeldeweg des Endkunden.
 *
 * **`@Public()` heißt hier „kein Keycloak-Token", nicht „offen".** Ein
 * Endkunde hat keines; geschützt wird über den `PortalAuthGuard` und die
 * Portal-Sitzung (s. dortige Doku). Die beiden Einstiegs-Routen sind
 * tatsächlich offen — sie MÜSSEN es sein, sonst könnte sich niemand erstmals
 * anmelden. Was sie schützt, ist der Zugangscode bzw. das Passwort, die
 * einheitliche Fehlermeldung und die Sperre nach mehreren Fehlversuchen.
 *
 * **Das Sitzungs-Token geht ausschließlich als `__Host-`-Cookie hinaus** —
 * httpOnly, Secure, SameSite=Strict. Es steht bewusst NICHT im Antwort-Body:
 * Ein Token, das JavaScript lesen kann, überlebt jede
 * Cross-Site-Scripting-Lücke der Oberfläche. Dieselbe Linie wie beim
 * Refresh-Token des Betriebs (`.claude/rules/frontend-react.md`).
 *
 * `SameSite=Strict` statt `Lax`: Das Portal hat keinen Anwendungsfall, bei
 * dem ein fremder Ursprung eine Navigation hierher auslöst — und Strict
 * schließt jede Cross-Site-Anfrage aus, statt nur die unsicheren Methoden.
 */
@Controller('portal/auth')
export class PortalAuthController {
  constructor(private readonly anmeldungService: PortalAnmeldungService) {}

  /**
   * Löst den Zugangscode aus dem Brief ein und setzt das Passwort.
   *
   * Der Kunde ist danach angemeldet — ein zweiter Anmeldeschritt unmittelbar
   * danach wäre eine Hürde ohne Sicherheitsgewinn.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('einloesen')
  async einloesen(
    @Body() dto: PortalEinloesenDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PortalAnmeldungAntwort> {
    const sitzung = await this.anmeldungService.loeseEin(dto.code, dto.passwort, request.synthetic ?? true);
    return this.setzeSitzungscookie(response, sitzung);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('anmeldung')
  async anmelden(
    @Body() dto: PortalAnmeldungDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PortalAnmeldungAntwort> {
    const sitzung = await this.anmeldungService.meldeAn(dto.kennung, dto.passwort, request.synthetic ?? true);
    return this.setzeSitzungscookie(response, sitzung);
  }

  /**
   * Meldet ab und löscht das Cookie.
   *
   * Bewusst OHNE `PortalAuthGuard`: Eine abgelaufene oder bereits beendete
   * Sitzung soll sich trotzdem abmelden können — sonst bliebe das Cookie im
   * Browser stehen, weil der Server 401 antwortet. Der Vorgang ist
   * idempotent und verrät nichts.
   */
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('abmeldung')
  async abmelden(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response): Promise<void> {
    const token = parseCookieHeader(request.headers.cookie)[PORTAL_SITZUNG_COOKIE];
    if (token !== undefined) {
      await this.anmeldungService.meldeAb(token, request.synthetic ?? true);
    }
    response.setHeader('Set-Cookie', buildDeleteHostCookie(PORTAL_SITZUNG_COOKIE, 'Strict'));
  }

  /**
   * „Wer bin ich?" — die Probe, dass die Sitzung trägt.
   *
   * Die Oberfläche holt hier die Endkunden-Kennung, mit der sie ihre Daten
   * nachlädt. Der Server nimmt diese Kennung NIE aus dem Client entgegen,
   * sondern immer aus der Sitzung: Sonst wäre der Zugriff auf fremde Daten
   * eine Frage der URL.
   */
  @Public()
  @UseGuards(PortalAuthGuard)
  @Get('ich')
  ich(@Req() request: AuthenticatedRequest): PortalIchAntwort {
    const kunde = requirePortalKunde(request);
    return { kennung: kunde.kennung, endkundeId: kunde.endkundeId };
  }

  private setzeSitzungscookie(response: Response, sitzung: PortalSitzungErgebnis): PortalAnmeldungAntwort {
    const maxAgeSeconds = Math.max(1, Math.floor((new Date(sitzung.laeuftAbAt).getTime() - Date.now()) / 1000));
    response.setHeader(
      'Set-Cookie',
      buildHostCookie(PORTAL_SITZUNG_COOKIE, sitzung.token, { maxAgeSeconds, sameSite: 'Strict' }),
    );
    return { kennung: sitzung.kennung, laeuftAbAt: sitzung.laeuftAbAt };
  }

}
