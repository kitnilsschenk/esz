import { Body, Controller, HttpCode, HttpStatus, Param, Post, Res, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { AuditAction } from '../../common/decorators/audit-action.decorator';
import { SyntheticOnlyInterceptor } from '../synthetic/synthetic-only.interceptor';
import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import { DeviceProvisioningService } from './device-provisioning.service';
import { GeraetZuordnungAnlegenDto } from './dto/geraet-zuordnung-anlegen.dto';
import type { GeraetZuordnungDetail } from './geraet-zuordnung.types';

/**
 * `/stammdaten/zaehler/{zaehlerId}/geraet-zuordnungen` (stammdaten.openapi.yaml,
 * ADR-0005 §26). Analog `MesskanalUnterZaehlerController` (nested Create
 * unter dem Zaehler; Einzel-Ressourcen-Operationen — hier NUR `update` —
 * leben top-level unter `/stammdaten/geraet-zuordnungen/{id}`,
 * `DeviceGeraetZuordnungController`).
 *
 * `read:geraet_zuordnung` (Liste/Reverse-Aufloesung) ist bewusst NICHT Teil
 * dieses Controllers (separater, break-glass-gehaerteter Folgeauftrag,
 * ADR-0005 §26.4 SEC-5) — dieses Modul kann `device.geraet_zuordnung`
 * NUR anlegen/aktualisieren, NIE lesen.
 */
@Controller('stammdaten/zaehler/:zaehlerId/geraet-zuordnungen')
export class GeraetZuordnungUnterZaehlerController {
  constructor(private readonly deviceProvisioningService: DeviceProvisioningService) {}

  @Roles('betrieb')
  @Fachaktion('create:geraet_zuordnung')
  @UseInterceptors(SyntheticOnlyInterceptor)
  @AuditAction<GeraetZuordnungDetail>({
    eventTyp: STAMMDATEN_EVENT_CODES.GERAET_ZUORDNUNG_PROVISIONIERT,
    objektRefExtractor: ({ result }) => result?.id,
    // ADR-0005 §19 Punkt 3 (kontext.synthetic Pflicht-Tag, analog ADR-0008
    // §22/D10) + V0015-Whitelist EXAKT { synthetic, zaehler_id,
    // pepper_version } — KEIN DevEUI-Klartext/Blind-Index im Kontext (RL-2).
    kontextExtractors: {
      synthetic: ({ request }) => request.synthetic,
      zaehler_id: ({ result }) => result?.zaehlerId,
      pepper_version: ({ result }) => result?.pepperVersion,
    },
  })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async anlegen(
    @Param('zaehlerId') zaehlerId: string,
    @Body() dto: GeraetZuordnungAnlegenDto,
    @Res({ passthrough: true }) response: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer den Decorator-Seiteneffekt (Praesenz-/Format-Validierung bzw. Body-Schema-Validierung).
    @IdempotencyKey() _idempotencyKey: string,
  ): Promise<GeraetZuordnungDetail> {
    const result = await this.deviceProvisioningService.anlegen(zaehlerId, dto);
    response.setHeader('Location', `/stammdaten/geraet-zuordnungen/${result.id}`);
    return result;
  }
}
