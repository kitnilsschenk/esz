import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseInterceptors } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Fachaktion } from '../common/decorators/fachaktion.decorator';
import { SyntheticOnlyInterceptor } from '../stammdaten/synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../stammdaten/common/idempotency-key.decorator';
import { requireSecurityContext } from '../stammdaten/common/security-context.util';
import type { AuthenticatedRequest } from '../common/security/authenticated-request';
import { PreflightService } from './preflight.service';
import type { PreflightMitBefunden } from './preflight.service';
import { PreflightAusfuehrenDto } from './dto/preflight-ausfuehren.dto';
import type { Preflight, PreflightBefund } from './persistence/nachweis-preflight.repository';
import type { Seite } from '../stammdaten/common/seite.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseLimit(limit?: string): number {
  const parsed = limit === undefined ? DEFAULT_LIMIT : Number.parseInt(limit, 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_LIMIT ? parsed : DEFAULT_LIMIT;
}

/**
 * `/nachweis/preflights` (ADR-0007 D4/B4/B10). KEIN `@AuditAction` auf
 * `ausfuehren()` — `PreflightService` emittiert `preflight.nachweis.
 * durchgefuehrt` manuell (identisches Muster zu `BerechnungslaufController`).
 */
@Controller('nachweis/preflights')
export class PreflightController {
  constructor(private readonly preflightService: PreflightService) {}

  @Roles('betrieb')
  @Fachaktion('create:nachweis_preflight')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async ausfuehren(
    @Body() dto: PreflightAusfuehrenDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<PreflightMitBefunden> {
    const subject = requireSecurityContext(request);
    return this.preflightService.ausfuehren(dto, subject, request.synthetic ?? false);
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:nachweis_preflight')
  @Get(':preflightId')
  async finden(@Param('preflightId') preflightId: string): Promise<Preflight> {
    return this.preflightService.finden(preflightId);
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:nachweis_preflight')
  @Get(':preflightId/befunde')
  async befunde(
    @Param('preflightId') preflightId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Seite<PreflightBefund>> {
    const cursorLfd = cursor === undefined ? undefined : Number.parseInt(cursor, 10);
    return this.preflightService.befunde(preflightId, {
      ...(cursorLfd !== undefined && Number.isFinite(cursorLfd) ? { cursorLfd } : {}),
      limit: parseLimit(limit),
    });
  }
}
