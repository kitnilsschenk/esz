import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { ListQueryDto, resolveLimit } from '../common/list-query.dto';
import type { Seite } from '../common/seite.dto';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { MesskanalService } from './messkanal.service';
import { MesskanalAnlegenDto } from './dto/messkanal-anlegen.dto';
import type { MesskanalDetail, MesskanalListItem } from './messkanal.types';

/** `/stammdaten/zaehler/{zaehlerId}/messkanaele` (stammdaten.openapi.yaml). */
@Controller('stammdaten/zaehler/:zaehlerId/messkanaele')
export class MesskanalUnterZaehlerController {
  constructor(private readonly messkanalService: MesskanalService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get()
  async liste(
    @Param('zaehlerId') zaehlerId: string,
    @Query() query: ListQueryDto,
  ): Promise<Seite<MesskanalListItem>> {
    return this.messkanalService.liste(zaehlerId, {
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      limit: resolveLimit(query.limit),
    });
  }

  @Roles('betrieb')
  @Fachaktion('create:messkanal')
  @AuditAction<MesskanalDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.MESSKANAL_ANGELEGT,
    objektRefExtractor: ({ result }) => result?.id,
  })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async anlegen(
    @Param('zaehlerId') zaehlerId: string,
    @Body() dto: MesskanalAnlegenDto,
    @Res({ passthrough: true }) response: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<MesskanalDetail> {
    const result = await this.messkanalService.anlegen(zaehlerId, dto);
    response.setHeader('Location', `/stammdaten/messkanaele/${result.id}`);
    return result;
  }
}
