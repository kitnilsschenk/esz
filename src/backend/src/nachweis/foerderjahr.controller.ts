import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseInterceptors } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Fachaktion } from '../common/decorators/fachaktion.decorator';
import { SyntheticOnlyInterceptor } from '../stammdaten/synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../stammdaten/common/idempotency-key.decorator';
import { requireSecurityContext } from '../stammdaten/common/security-context.util';
import type { AuthenticatedRequest } from '../common/security/authenticated-request';
import { FoerderjahrService } from './foerderjahr.service';
import { FoerderjahrAnlegenDto } from './dto/foerderjahr-anlegen.dto';
import type { Foerderjahr } from './persistence/nachweis-foerderjahr.repository';
import type { Seite } from '../stammdaten/common/seite.dto';

/**
 * `/nachweis/foerderjahre` (`schemas/openapi/nachweis.openapi.yaml`, ADR-0007
 * B4/B10). Lesen läuft laut B10-Tabelle über die BESTEHENDE Fachaktion
 * `read:stammdaten` (KEIN eigenes `read:foerderjahr` — B10 wörtlich:
 * „POST /nachweis/foerderjahre → create:foerderjahr (Lesen über
 * read:stammdaten)").
 */
@Controller('nachweis/foerderjahre')
export class FoerderjahrController {
  constructor(private readonly foerderjahrService: FoerderjahrService) {}

  @Roles('betrieb')
  @Fachaktion('create:foerderjahr')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async anlegen(
    @Body() dto: FoerderjahrAnlegenDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<Foerderjahr> {
    const subject = requireSecurityContext(request);
    return this.foerderjahrService.anlegen(dto, subject, request.synthetic ?? false);
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get()
  async liste(@Query('cursor') cursor?: string, @Query('limit') limit?: string): Promise<Seite<Foerderjahr>> {
    const parsedLimit = limit === undefined ? 50 : Number.parseInt(limit, 10);
    const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 && parsedLimit <= 100 ? parsedLimit : 50;
    return this.foerderjahrService.liste({ ...(cursor !== undefined ? { cursor } : {}), limit: effectiveLimit });
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get(':foerderjahrId')
  async finden(@Param('foerderjahrId') foerderjahrId: string): Promise<Foerderjahr> {
    return this.foerderjahrService.finden(foerderjahrId);
  }
}
