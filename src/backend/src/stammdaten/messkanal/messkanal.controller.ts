import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { MesskanalService } from './messkanal.service';
import { MesskanalAendernDto } from './dto/messkanal-aendern.dto';
import type { MesskanalDetail } from './messkanal.types';

/** `/stammdaten/messkanaele/{messkanalId}` (stammdaten.openapi.yaml). */
@Controller('stammdaten/messkanaele')
export class MesskanalController {
  constructor(private readonly messkanalService: MesskanalService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get(':messkanalId')
  async lesen(@Param('messkanalId') messkanalId: string): Promise<MesskanalDetail> {
    return this.messkanalService.detail(messkanalId);
  }

  @Roles('betrieb')
  @Fachaktion('update:messkanal')
  @AuditAction<MesskanalDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.MESSKANAL_GEAENDERT,
    objektRefExtractor: ({ result }) => result?.id,
  })
  @Patch(':messkanalId')
  async aendern(
    @Param('messkanalId') messkanalId: string,
    @Body() dto: MesskanalAendernDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<MesskanalDetail> {
    return this.messkanalService.aendern(messkanalId, dto);
  }

  @Roles('betrieb')
  @Fachaktion('delete:messkanal')
  @AuditAction<MesskanalDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.MESSKANAL_STILLGELEGT,
    objektRefExtractor: ({ result }) => result?.id,
  })
  @Delete(':messkanalId')
  async stilllegen(
    @Param('messkanalId') messkanalId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<MesskanalDetail> {
    return this.messkanalService.stilllegen(messkanalId);
  }
}
