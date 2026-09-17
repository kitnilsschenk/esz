import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put, Req, UseInterceptors } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { SyntheticOnlyInterceptor } from '../synthetic/synthetic-only.interceptor';
import { requireSecurityContext } from '../common/security-context.util';
import type { AuthenticatedRequest } from '../../common/security/authenticated-request';
import { SystemgrenzeService } from './systemgrenze.service';
import type { SystemgrenzeAntwort } from './systemgrenze.service';
import { SystemgrenzeSetzenDto } from './dto/systemgrenze-setzen.dto';

/**
 * `/stammdaten/messkonzept-energietraeger/{mvetId}/systeme` — die
 * Systemgrenze eines Messkonzept-Energieträgers.
 *
 * **Warum die mvet-Kennung im Pfad und nicht der Endkunde plus Versionsnummer
 * plus Energieträger.** Die `mvetId` ist bereits Teil der API-Oberfläche: Der
 * Berechnungslauf nimmt sie als Pflichtfeld entgegen. Sie hier erneut über
 * drei Pfadsegmente aufzulösen wäre derselbe Schlüssel in einer zweiten
 * Schreibweise — und die Oberfläche müsste beides ineinander übersetzen.
 */
@Controller('stammdaten/messkonzept-energietraeger/:mvetId/systeme')
export class SystemgrenzeController {
  constructor(private readonly systemgrenzeService: SystemgrenzeService) {}

  /**
   * Die aktuelle Grenze samt Auswahl.
   *
   * Die Antwort trägt auch die WÄHLBAREN Systeme mit: Eine Oberfläche, die
   * eine Menge bearbeiten lässt, braucht beides in einem Zug — und eine
   * zweite Route, die „alle Systeme dieses Endkunden" liefert, gibt es
   * bereits, nur mit Cursor-Paginierung und ohne den Bezug zur Grenze.
   */
  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get()
  async lesen(@Param('mvetId') mvetId: string): Promise<SystemgrenzeAntwort> {
    return this.systemgrenzeService.lesen(mvetId);
  }

  /**
   * Setzt die Grenze auf genau diese Systeme.
   *
   * `PUT` und nicht `POST`/`DELETE` je Eintrag: Die Systemgrenze ist eine
   * Menge, und wer sie ändert, meint den neuen Zustand. Der Vorgang ist damit
   * idempotent — ein zweiter Aufruf mit demselben Inhalt ändert nichts.
   */
  @Roles('betrieb')
  @Fachaktion('update:messkonzept_version')
  @UseInterceptors(SyntheticOnlyInterceptor)
  // KEIN `@AuditAction`: Das Ereignis traegt die Anzahl VORHER, und die steht
  // nicht in der Antwort. Es wird deshalb im Dienst emittiert (dieselbe Linie
  // wie beim Portal-Zugang).
  @HttpCode(HttpStatus.OK)
  @Put()
  async setzen(
    @Param('mvetId') mvetId: string,
    @Body() dto: SystemgrenzeSetzenDto,
    @Req() request: AuthenticatedRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<SystemgrenzeAntwort> {
    const subject = requireSecurityContext(request);
    return this.systemgrenzeService.setzen(mvetId, dto.systemIds, subject, request.synthetic ?? true);
  }
}
