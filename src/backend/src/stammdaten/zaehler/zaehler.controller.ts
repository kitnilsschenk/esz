import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { resolveLimit } from '../common/list-query.dto';
import type { Seite } from '../common/seite.dto';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { ZaehlerService } from './zaehler.service';
import { ZaehlerAnlegenDto } from './dto/zaehler-anlegen.dto';
import { ZaehlerAendernDto } from './dto/zaehler-aendern.dto';
import { ZaehlerListQueryDto } from './dto/zaehler-list-query.dto';
import type { ZaehlerDetail, ZaehlerListItem } from './zaehler.types';

@Controller('stammdaten/zaehler')
export class ZaehlerController {
  constructor(private readonly zaehlerService: ZaehlerService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get()
  async liste(@Query() query: ZaehlerListQueryDto): Promise<Seite<ZaehlerListItem>> {
    return this.zaehlerService.liste({
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      ...(query.systemId !== undefined ? { systemId: query.systemId } : {}),
      limit: resolveLimit(query.limit),
    });
  }

  @Roles('betrieb')
  @Fachaktion('create:zaehler')
  @AuditAction<ZaehlerDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.ZAEHLER_ANGELEGT,
    objektRefExtractor: ({ result }) => result?.id,
  })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async anlegen(
    @Body() dto: ZaehlerAnlegenDto,
    @Res({ passthrough: true }) response: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<ZaehlerDetail> {
    const result = await this.zaehlerService.anlegen(dto);
    response.setHeader('Location', `/stammdaten/zaehler/${result.id}`);
    return result;
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get(':zaehlerId')
  async lesen(@Param('zaehlerId') zaehlerId: string): Promise<ZaehlerDetail> {
    return this.zaehlerService.detail(zaehlerId);
  }

  @Roles('betrieb')
  @Fachaktion('update:zaehler')
  @AuditAction<ZaehlerDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.ZAEHLER_GEAENDERT,
    objektRefExtractor: ({ result }) => result?.id,
  })
  @Patch(':zaehlerId')
  async aendern(
    @Param('zaehlerId') zaehlerId: string,
    @Body() dto: ZaehlerAendernDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<ZaehlerDetail> {
    return this.zaehlerService.aendern(zaehlerId, dto);
  }

  @Roles('betrieb')
  @Fachaktion('delete:zaehler')
  @AuditAction<ZaehlerDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.ZAEHLER_STILLGELEGT,
    objektRefExtractor: ({ result }) => result?.id,
  })
  @Delete(':zaehlerId')
  async stilllegen(
    @Param('zaehlerId') zaehlerId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<ZaehlerDetail> {
    return this.zaehlerService.stilllegen(zaehlerId);
  }
}
