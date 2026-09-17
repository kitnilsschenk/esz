import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Fachaktion } from '../common/decorators/fachaktion.decorator';
import type { AuthenticatedRequest } from '../common/security/authenticated-request';
import { requireSecurityContext } from '../stammdaten/common/security-context.util';
import { IdempotencyKey } from '../stammdaten/common/idempotency-key.decorator';
import { Art19Service, type Art19PflichtReport } from './art19.service';
import { Art19MitteilungAnlegenDto } from './dto/art19-mitteilung-anlegen.dto';

/**
 * `/nachweis/art19-pflichten` — Mitteilungspflichten nach Art. 19 DSGVO
 * (ADR-0007 A18/A11.12).
 *
 * Im `nachweis`-Modul, nicht im Monitoring: das Register ist
 * `nachweis.einreichung` × `einsparlauf_bindung`, und die Grants auf diese
 * Tabellen liegen hier. Fachlich ist es eine Pflicht gegenueber dem
 * EMPFAENGER der Einreichung — sie haengt an der Einreichung, nicht am
 * Stammdatensatz.
 *
 * Lesen: `betrieb` UND `compliance-auditor`. Fuer den Auditor ist die Liste
 * der OFFENEN Pflichten der eigentliche Prueffall.
 *
 * KEIN `@AuditAction` auf `mitteilen()`: der Service emittiert selbst — er
 * kennt den `anlass` und den Kanal aus dem Vorgang und schreibt erst NACH
 * erfolgreichem Beleg (Muster `EinsparlaufService`).
 */
@Controller('nachweis/art19-pflichten')
export class Art19Controller {
  constructor(private readonly art19Service: Art19Service) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:art19_pflicht')
  @Get()
  async liste(): Promise<Art19PflichtReport> {
    return this.art19Service.report();
  }

  @Roles('betrieb')
  @Fachaktion('create:art19_mitteilung')
  @HttpCode(HttpStatus.OK)
  @Post('mitteilungen')
  async mitteilen(
    @Body() dto: Art19MitteilungAnlegenDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<Art19PflichtReport> {
    const subject = requireSecurityContext(request);
    return this.art19Service.dokumentiereMitteilung(dto, subject);
  }
}
