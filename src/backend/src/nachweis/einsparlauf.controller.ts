import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseInterceptors } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Fachaktion } from '../common/decorators/fachaktion.decorator';
import { SyntheticOnlyInterceptor } from '../stammdaten/synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../stammdaten/common/idempotency-key.decorator';
import { requireSecurityContext } from '../stammdaten/common/security-context.util';
import type { AuthenticatedRequest } from '../common/security/authenticated-request';
import { EinsparlaufService } from './einsparlauf.service';
import { EinsparlaufAnlegenDto } from './dto/einsparlauf-anlegen.dto';
import type { EinsparlaufAntwort } from './einsparlauf.types';
import type { EinsparlaufListItem } from './persistence/nachweis-einsparlauf.repository';
import type { Seite } from '../stammdaten/common/seite.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseLimit(limit?: string): number {
  const parsed = limit === undefined ? DEFAULT_LIMIT : Number.parseInt(limit, 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_LIMIT ? parsed : DEFAULT_LIMIT;
}

/**
 * `/nachweis/einsparlaeufe` (ADR-0007 D1/B1/B2/B10). `create:einsparlauf` ist
 * eine PORTFOLIOWEITE Aktion OHNE `endkundeId` (B1/B10 wörtlich) — anders als
 * `BerechnungslaufController` gibt es HIER keinen Body-`endkundeId`-Pfad für
 * die ABAC-Auflösung (`StammdatenResourceAttributesProvider` liefert für
 * diese Route strukturell `undefined` → `kein_ressourcenbezug`/permit, RBAC
 * `@Roles('betrieb')` trägt den Schutz).
 *
 * KEIN `@AuditAction` auf `anlegen()` — `EinsparlaufService` emittiert bis zu
 * VIER unterschiedliche Event-Typen (Muster `BerechnungslaufController`).
 */
@Controller('nachweis/einsparlaeufe')
export class EinsparlaufController {
  constructor(private readonly einsparlaufService: EinsparlaufService) {}

  @Roles('betrieb')
  @Fachaktion('create:einsparlauf')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async anlegen(
    @Body() dto: EinsparlaufAnlegenDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<EinsparlaufAntwort> {
    const subject = requireSecurityContext(request);
    return this.einsparlaufService.starten(dto, subject, request.synthetic ?? false);
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:einsparlauf')
  @Get()
  async liste(
    @Query('foerderjahr') foerderjahrId?: string,
    @Query('art') art?: 'foerderjahr_nachweis' | 'zwischenstand',
    @Query('nurAktuelle') nurAktuelle?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Seite<EinsparlaufListItem>> {
    return this.einsparlaufService.liste({
      ...(foerderjahrId !== undefined ? { foerderjahrId } : {}),
      ...(art !== undefined ? { art } : {}),
      ...(nurAktuelle !== undefined ? { nurAktuelle: nurAktuelle === 'true' } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
      limit: parseLimit(limit),
    });
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:einsparlauf')
  @Get(':einsparlaufId')
  async finden(@Param('einsparlaufId') einsparlaufId: string): Promise<EinsparlaufAntwort> {
    return this.einsparlaufService.finden(einsparlaufId);
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:einsparlauf')
  @Get(':einsparlaufId/ergebnisse')
  async ergebnisse(
    @Param('einsparlaufId') einsparlaufId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): ReturnType<EinsparlaufService['ergebnisse']> {
    const [cursorEndkundeId, cursorEnergietraeger] = this.splitCursor(cursor, 2);
    return this.einsparlaufService.ergebnisse(einsparlaufId, {
      ...(cursorEndkundeId !== undefined ? { cursorEndkundeId } : {}),
      ...(cursorEnergietraeger !== undefined ? { cursorEnergietraeger } : {}),
      limit: parseLimit(limit),
    });
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:einsparlauf')
  @Get(':einsparlaufId/bindungen')
  async bindungen(
    @Param('einsparlaufId') einsparlaufId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): ReturnType<EinsparlaufService['bindungen']> {
    const [cursorEndkundeId, cursorEnergietraeger, cursorMonat] = this.splitCursor(cursor, 3);
    return this.einsparlaufService.bindungen(einsparlaufId, {
      ...(cursorEndkundeId !== undefined ? { cursorEndkundeId } : {}),
      ...(cursorEnergietraeger !== undefined ? { cursorEnergietraeger } : {}),
      ...(cursorMonat !== undefined ? { cursorMonat } : {}),
      limit: parseLimit(limit),
    });
  }

  /** Opaker Cursor `endkundeId:energietraeger[:monat]` (s. `EinsparlaufService.ergebnisse()`/`.bindungen()`). */
  private splitCursor(cursor: string | undefined, teile: number): (string | undefined)[] {
    if (cursor === undefined) {
      return new Array<undefined>(teile).fill(undefined);
    }
    const segmente = cursor.split(':');
    return Array.from({ length: teile }, (_v, i) => segmente[i]);
  }
}
