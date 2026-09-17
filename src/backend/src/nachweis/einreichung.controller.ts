import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Fachaktion } from '../common/decorators/fachaktion.decorator';
import { IdempotencyKey } from '../stammdaten/common/idempotency-key.decorator';
import { requireSecurityContext } from '../stammdaten/common/security-context.util';
import type { AuthenticatedRequest } from '../common/security/authenticated-request';
import { EinreichungService } from './einreichung.service';
import { EinreichungAnlegenDto } from './dto/einreichung-anlegen.dto';
import type { EinreichungDifferenzZeile } from './persistence/nachweis-einreichung.repository';
import { mapEinreichungAntwort, type EinreichungAntwort } from './einreichung.types';
import type { Seite } from '../stammdaten/common/seite.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseLimit(limit?: string): number {
  const parsed = limit === undefined ? DEFAULT_LIMIT : Number.parseInt(limit, 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_LIMIT ? parsed : DEFAULT_LIMIT;
}

/**
 * `/nachweis/exporte/{id}/einreichungen` + `/nachweis/einreichungen/{id}[/differenzen]`
 * (ADR-0007 D7/B7/B10). `read:einreichung` ist — ANDERS als
 * `read:nachweis_export` — AUSDRÜCKLICH auditor-zugänglich (B10: „die
 * Metadaten sind sein Prüfgegenstand, nicht sein Risiko").
 *
 * **Kein Vier-Augen für `create:einreichung`** (B14/C8-Beschluss) — EIN
 * `@Roles('betrieb')` genügt, keine Zweitfreigabe-Prüfung.
 *
 * KEIN `@AuditAction` — `EinreichungService.vermerken()` emittiert
 * `einreichung.nachweis.vermerkt`/`.korrigiert` manuell.
 */
@Controller()
export class EinreichungController {
  constructor(private readonly einreichungService: EinreichungService) {}

  @Roles('betrieb')
  @Fachaktion('create:einreichung')
  @HttpCode(HttpStatus.CREATED)
  @Post('nachweis/exporte/:exportId/einreichungen')
  async vermerken(
    @Param('exportId') exportId: string,
    @Body() dto: EinreichungAnlegenDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<EinreichungAntwort> {
    const subject = requireSecurityContext(request);
    return mapEinreichungAntwort(await this.einreichungService.vermerken(exportId, dto, subject));
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:einreichung')
  @Get('nachweis/einreichungen/:einreichungId')
  async finden(@Param('einreichungId') einreichungId: string): Promise<EinreichungAntwort> {
    return mapEinreichungAntwort(await this.einreichungService.finden(einreichungId));
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:einreichung')
  @Get('nachweis/einreichungen/:einreichungId/differenzen')
  async differenzen(
    @Param('einreichungId') einreichungId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Seite<EinreichungDifferenzZeile>> {
    const [cursorEndkundeId, cursorEnergietraeger] = this.splitCursor(cursor);
    return this.einreichungService.differenzen(einreichungId, {
      ...(cursorEndkundeId !== undefined ? { cursorEndkundeId } : {}),
      ...(cursorEnergietraeger !== undefined ? { cursorEnergietraeger } : {}),
      limit: parseLimit(limit),
    });
  }

  /** Opaker Cursor `endkundeId:energietraeger` (Muster `EinsparlaufController`). */
  private splitCursor(cursor: string | undefined): (string | undefined)[] {
    if (cursor === undefined) {
      return [undefined, undefined];
    }
    const segmente = cursor.split(':');
    return [segmente[0], segmente[1]];
  }
}
