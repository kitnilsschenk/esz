import { Body, Controller, Param, Patch, Req, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { SyntheticOnlyInterceptor } from '../synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { requireSecurityContext } from '../common/security-context.util';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import { EinflussgroesseService } from './einflussgroesse.service';
import { EinflussgroesseKorrigierenDto } from './dto/einflussgroesse-korrigieren.dto';
import type { EinflussgroesseKorrekturErgebnis } from './einflussgroesse.types';

/**
 * `/stammdaten/einflussgroessen/{einflussgroesseId}` (ADR-0006 Teil B, B8/B10)
 * — `update:einflussgroesse`. KEIN `@AuditAction` (anders als jede andere
 * schreibende Route in `stammdaten/**`): `EinflussgroesseService.korrigieren()`
 * emittiert MANUELL bis zu ZWEI Event-TYPEN je Aufruf (`.geaendert` IMMER,
 * `.erfasst` NUR bei begleitender Korrektur-Zeile) — `@AuditAction` kennt nur
 * GENAU EINEN statischen `eventTyp` je Route (Präzedenzfall
 * `BerechnungslaufController`/`ShredAntragService`, s. dortige Kommentare).
 */
@Controller('stammdaten/einflussgroessen')
export class EinflussgroesseController {
  constructor(private readonly einflussgroesseService: EinflussgroesseService) {}

  @Roles('betrieb')
  @Fachaktion('update:einflussgroesse')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @Patch(':einflussgroesseId')
  async korrigieren(
    @Param('einflussgroesseId') einflussgroesseId: string,
    @Body() dto: EinflussgroesseKorrigierenDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<EinflussgroesseKorrekturErgebnis> {
    const subject = requireSecurityContext(request);
    return this.einflussgroesseService.korrigieren(einflussgroesseId, dto, subject, request.synthetic ?? false);
  }
}
