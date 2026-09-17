import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { ListQueryDto, resolveLimit } from '../common/list-query.dto';
import type { Seite } from '../common/seite.dto';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { MesskonzeptService } from './messkonzept.service';
import { MesskonzeptVersionAnlegenDto } from './dto/messkonzept-version-anlegen.dto';
import type { MesskonzeptVersionDetail, MesskonzeptVersionListItem } from './messkonzept.types';

/** `/stammdaten/endkunden/{endkundeId}/messkonzept/versionen(/{versionNr})` (stammdaten.openapi.yaml). */
@Controller('stammdaten/endkunden/:endkundeId/messkonzept/versionen')
export class MesskonzeptController {
  constructor(private readonly messkonzeptService: MesskonzeptService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get()
  async liste(
    @Param('endkundeId') endkundeId: string,
    @Query() query: ListQueryDto,
  ): Promise<Seite<MesskonzeptVersionListItem>> {
    return this.messkonzeptService.listVersionen(endkundeId, {
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      limit: resolveLimit(query.limit),
    });
  }

  @Roles('betrieb')
  @Fachaktion('create:messkonzept_version')
  @AuditAction<MesskonzeptVersionDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.MESSKONZEPT_VERSION_ANGELEGT,
    objektRefExtractor: ({ request }) => request.params['endkundeId'],
    // KEIN `?? null`-Fallback: auf Fehlerpfaden (404/400/403) ist `result`
    // undefined; `AuditActionInterceptor.buildKontext()` laesst undefined-Keys
    // weg. Ein JSON `null` wuerde dagegen vom Audit-Seal-Trigger
    // (`audit.event_seal()`, V0003 — nur string|number|boolean) abgelehnt, der
    // Emit im catch-Zweig wuerfe selbst und maskierte den echten Statuscode
    // als 500 (Regression, ADR-0008 §30.1 / messkonzept.integration.spec.ts).
    kontextExtractors: { version_nr: ({ result }) => result?.versionNr },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async anlegen(
    @Param('endkundeId') endkundeId: string,
    @Body() dto: MesskonzeptVersionAnlegenDto,
    @Res({ passthrough: true }) response: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<MesskonzeptVersionDetail> {
    const result = await this.messkonzeptService.anlegenVersion(endkundeId, dto);
    response.setHeader(
      'Location',
      `/stammdaten/endkunden/${endkundeId}/messkonzept/versionen/${String(result.versionNr)}`,
    );
    return result;
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get(':versionNr')
  async lesen(
    @Param('endkundeId') endkundeId: string,
    @Param('versionNr', ParseIntPipe) versionNr: number,
  ): Promise<MesskonzeptVersionDetail> {
    return this.messkonzeptService.getVersion(endkundeId, versionNr);
  }
}
