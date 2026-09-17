import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { resolveLimit } from '../common/list-query.dto';
import type { Seite } from '../common/seite.dto';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { SystemService } from './system.service';
import { SystemAnlegenDto } from './dto/system-anlegen.dto';
import { SystemAendernDto } from './dto/system-aendern.dto';
import { SystemListQueryDto } from './dto/system-list-query.dto';
import type { SystemDetail, SystemListItem } from './system.types';

@Controller('stammdaten/systeme')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get()
  async liste(@Query() query: SystemListQueryDto): Promise<Seite<SystemListItem>> {
    return this.systemService.liste({
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      ...(query.endkundeId !== undefined ? { endkundeId: query.endkundeId } : {}),
      limit: resolveLimit(query.limit),
    });
  }

  @Roles('betrieb')
  @Fachaktion('create:system')
  @AuditAction<SystemDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.SYSTEM_ANGELEGT,
    objektRefExtractor: ({ result }) => result?.id,
  })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async anlegen(
    @Body() dto: SystemAnlegenDto,
    @Res({ passthrough: true }) response: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<SystemDetail> {
    const result = await this.systemService.anlegen(dto);
    response.setHeader('Location', `/stammdaten/systeme/${result.id}`);
    return result;
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get(':systemId')
  async lesen(@Param('systemId') systemId: string): Promise<SystemDetail> {
    return this.systemService.detail(systemId);
  }

  @Roles('betrieb')
  @Fachaktion('update:system')
  @AuditAction<SystemDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.SYSTEM_GEAENDERT,
    objektRefExtractor: ({ result }) => result?.id,
  })
  @Patch(':systemId')
  async aendern(
    @Param('systemId') systemId: string,
    @Body() dto: SystemAendernDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<SystemDetail> {
    return this.systemService.aendern(systemId, dto);
  }

  @Roles('betrieb')
  @Fachaktion('delete:system')
  @AuditAction<SystemDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.SYSTEM_STILLGELEGT,
    objektRefExtractor: ({ result }) => result?.id,
  })
  @Delete(':systemId')
  async stilllegen(
    @Param('systemId') systemId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<SystemDetail> {
    return this.systemService.stilllegen(systemId);
  }
}
