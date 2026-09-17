import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put, Req, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { SyntheticOnlyInterceptor } from '../synthetic/synthetic-only.interceptor';
import { requireSecurityContext } from '../common/security-context.util';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import { BaselinePeriodeService } from './baseline-periode.service';
import type { BaselinePeriodenAntwort } from './baseline-periode.service';
import { BaselinePeriodenSetzenDto } from './dto/baseline-perioden-setzen.dto';

/**
 * `/stammdaten/messkonzept-energietraeger/{mvetId}/baseline-perioden` — die
 * Bezugszeiträume, aus denen GTZ_base hergeleitet wird.
 *
 * Liegt am selben Pfad-Präfix wie die Systemgrenze und aus demselben Grund:
 * Die `mvetId` ist bereits Teil der API-Oberfläche (der Berechnungslauf nimmt
 * sie als Pflichtfeld), und beide Angaben hängen am Energieträger einer
 * Version, nicht am Endkunden.
 */
@Controller('stammdaten/messkonzept-energietraeger/:mvetId/baseline-perioden')
export class BaselinePeriodeController {
  constructor(private readonly baselinePeriodeService: BaselinePeriodeService) {}

  /**
   * Die erfassten Perioden samt dem, was aus ihnen folgt.
   *
   * Die Antwort trägt die Baseline-Kopfdaten mit (`baselineWert`,
   * `baselineEinheit`, `abrechnungenAnzahlDeklariert`): Ohne sie liesse sich
   * nicht sehen, ob die Perioden zu dem passen, was sie belegen sollen — und
   * eine Oberfläche müsste sie aus einer zweiten Route nachladen.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get()
  async lesen(@Param('mvetId') mvetId: string): Promise<BaselinePeriodenAntwort> {
    return this.baselinePeriodeService.lesen(mvetId);
  }

  /**
   * Setzt die Perioden auf genau diese Menge.
   *
   * `PUT` und nicht `POST`/`DELETE` je Periode: Die Perioden wirken nur
   * gemeinsam (der Lauf mittelt über alle). Wer eine ändert, verschiebt den
   * Nenner der Witterungsbereinigung und soll dabei den ganzen Satz sehen.
   * Der Vorgang ist damit idempotent.
   */
  @Roles('betrieb')
  @Fachaktion('update:messkonzept_version')
  @UseInterceptors(SyntheticOnlyInterceptor)
  // KEIN `@AuditAction`: Das Ereignis traegt die Anzahl VORHER, und die steht
  // nicht in der Antwort. Es wird deshalb im Dienst emittiert.
  @HttpCode(HttpStatus.OK)
  @Put()
  async setzen(
    @Param('mvetId') mvetId: string,
    @Body() dto: BaselinePeriodenSetzenDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<BaselinePeriodenAntwort> {
    const subject = requireSecurityContext(request);
    return this.baselinePeriodeService.setzen(
      mvetId,
      dto.perioden.map((p) => ({
        von: p.von,
        bis: p.bis,
        menge: p.menge ?? null,
        einheit: p.einheit ?? null,
      })),
      subject,
      request.synthetic ?? true,
    );
  }
}
