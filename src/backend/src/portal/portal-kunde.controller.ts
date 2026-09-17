import { Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedRequest } from '../common/security/authenticated-request';
import type { NutzerinfoBericht, NutzerinformationItem } from '../nutzerinfo/nutzerinfo.types';
import type { DigitaleErklaerung } from '../consent/widerspruch.service';
import { PortalAuthGuard, requirePortalKunde } from './guards/portal-auth.guard';
import { PortalKundeService } from './portal-kunde.service';
import type { PortalWiderspruchStand } from './portal-kunde.service';

/**
 * `/portal/*` — was ein angemeldeter Endkunde über sich sieht und tut.
 *
 * **Keine Route nimmt eine Endkunden-Kennung entgegen.** Sie kommt
 * ausschließlich aus der Sitzung (`requirePortalKunde`). Stünde sie im Pfad,
 * wäre der Blick in fremde Verbrauchsdaten eine Frage der URL — und die
 * Prüfung, ob beide übereinstimmen, eine Zeile, die man vergessen kann.
 *
 * `@Public()` heißt hier „kein Keycloak-Token"; geschützt wird über den
 * `PortalAuthGuard` (s. dortige Doku).
 */
@Public()
@UseGuards(PortalAuthGuard)
@Controller('portal')
export class PortalKundeController {
  constructor(private readonly kundeService: PortalKundeService) {}

  /** Der Verlauf der eigenen Monatsinformationen. */
  @Get('informationen')
  async informationen(@Req() request: AuthenticatedRequest): Promise<readonly NutzerinformationItem[]> {
    return this.kundeService.informationen(requirePortalKunde(request).endkundeId);
  }

  @Get('informationen/:informationId/bericht')
  async bericht(
    @Param('informationId') informationId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<NutzerinfoBericht> {
    return this.kundeService.bericht(requirePortalKunde(request).endkundeId, informationId);
  }

  /** Dasselbe Dokument, das auch per Post ginge — zum Ausdrucken oder Aufheben. */
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Get('informationen/:informationId/dokument')
  async dokument(
    @Param('informationId') informationId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<string> {
    return this.kundeService.dokument(requirePortalKunde(request).endkundeId, informationId);
  }

  @Get('widerspruch')
  async widerspruchStand(@Req() request: AuthenticatedRequest): Promise<PortalWiderspruchStand> {
    return this.kundeService.widerspruchStand(requirePortalKunde(request).endkundeId);
  }

  /**
   * Das digitale Opt-out ([Q3] Kap. 6).
   *
   * Ohne Body: Der Zweck steht fest (`nutzerinformation` — der einzige, gegen
   * den ein Endkunde widersprechen KANN), und der Erklärungszeitpunkt ist
   * jetzt. Hier trägt niemand etwas nach.
   *
   * IP und User-Agent kommen aus dem Request, nicht aus dem Body: Eine vom
   * Client gelieferte IP wäre kein Nachweis, sondern eine Behauptung.
   */
  @HttpCode(HttpStatus.OK)
  @Post('widerspruch')
  async widersprich(@Req() request: AuthenticatedRequest): Promise<PortalWiderspruchStand> {
    const kunde = requirePortalKunde(request);
    return this.kundeService.widersprich(kunde.endkundeId, this.digitaleErklaerung(request));
  }

  @HttpCode(HttpStatus.OK)
  @Post('widerspruch/ruecknahme')
  async nimmZurueck(@Req() request: AuthenticatedRequest): Promise<PortalWiderspruchStand> {
    const kunde = requirePortalKunde(request);
    return this.kundeService.nimmWiderspruchZurueck(kunde.endkundeId, this.digitaleErklaerung(request));
  }

  /**
   * Die Begleitangaben der digitalen Erklärung (DS-03).
   *
   * `request.ip` ist die vom Server ermittelte Adresse. Sie ist die einzige,
   * die als Nachweis taugt — ein Header, den der Client selbst setzt, wäre
   * eine Behauptung über sich selbst.
   *
   * **Hinweis für den Betrieb hinter einem Reverse Proxy:** Damit hier nicht
   * die Adresse des Proxys steht, muss Express `trust proxy` gesetzt sein.
   * Ohne das ist der Nachweis nach DS-03 formal vorhanden und inhaltlich
   * wertlos — er belegte, dass sich der Proxy erklärt hat.
   */
  private digitaleErklaerung(request: AuthenticatedRequest): DigitaleErklaerung {
    const userAgent = request.headers['user-agent'];
    return {
      ip: request.ip ?? 'unbekannt',
      userAgent: typeof userAgent === 'string' && userAgent.length > 0 ? userAgent.slice(0, 500) : undefined,
    };
  }
}
