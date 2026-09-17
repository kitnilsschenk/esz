import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseInterceptors } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Fachaktion } from '../common/decorators/fachaktion.decorator';
import { IdempotencyKey } from '../stammdaten/common/idempotency-key.decorator';
import { SyntheticOnlyInterceptor } from '../stammdaten/synthetic/synthetic-only.interceptor';
import { requireSecurityContext } from '../stammdaten/common/security-context.util';
import type { AuthenticatedRequest } from '../common/security/authenticated-request';
import { PortalZugangService } from './portal-zugang.service';
import type { PortalZugangAusgabe, PortalZugangStand } from './portal-zugang.service';

/**
 * `/stammdaten/endkunden/{id}/portal-zugang` — die Betriebssicht auf den
 * Portal-Zugang eines Endkunden.
 *
 * Bewusst UNTER dem Endkunden und nicht unter `/portal`: Der Vorgang ist eine
 * Stammdaten-Handlung des Betriebs an einem Kunden, kein Portal-Vorgang. Die
 * Rollen- und ABAC-Kette gilt hier unverändert — anders als auf den
 * `/portal/auth/*`-Routen, die der Kunde selbst benutzt.
 */
@Controller('stammdaten/endkunden/:endkundeId/portal-zugang')
export class PortalZugangController {
  constructor(private readonly zugangService: PortalZugangService) {}

  /**
   * Der Stand — ohne Code.
   *
   * Es gibt bewusst KEINE Route, die einen ausgegebenen Code erneut liefert.
   * Ein nachschlagbarer Code wäre ein Generalschlüssel zu fremden
   * Verbrauchsdaten, und der Betrieb hätte ihn dauerhaft in Reichweite.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get()
  async stand(@Param('endkundeId') endkundeId: string): Promise<PortalZugangStand> {
    return this.zugangService.stand(endkundeId);
  }

  /**
   * Gibt einen Zugangscode aus — der EINZIGE Moment, in dem der Code im
   * Klartext existiert.
   *
   * Die Antwort enthält ihn genau einmal, für den Brief. Wer sie verliert,
   * gibt einen neuen Code aus; der alte wird dabei ungültig.
   *
   * KEIN `@AuditAction`: Das Ereignis wird im Service emittiert, weil dort
   * feststeht, ob ein Zugang NEU entstand oder einen Ersatzcode bekam
   * (`kontext.erneut`) — und genau diese Unterscheidung ist der Wert des
   * Eintrags.
   */
  @Roles('betrieb')
  @Fachaktion('create:endkunde')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @Post('codes')
  async gibCodeAus(
    @Param('endkundeId') endkundeId: string,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<PortalZugangAusgabe> {
    const subject = requireSecurityContext(request);
    return this.zugangService.gibCodeAus(endkundeId, subject, request.synthetic ?? true);
  }

  /**
   * Sperrt den Zugang und beendet alle offenen Sitzungen.
   *
   * Aus einer Sperre führt kein neuer Code heraus — sie ist bewusst kein
   * Zustand, der sich von selbst auflöst.
   */
  @Roles('betrieb')
  @Fachaktion('update:endkunde')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post('sperre')
  async sperre(
    @Param('endkundeId') endkundeId: string,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<PortalZugangStand> {
    const subject = requireSecurityContext(request);
    return this.zugangService.sperre(endkundeId, subject, request.synthetic ?? true);
  }
}
