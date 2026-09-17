import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Fachaktion } from '../common/decorators/fachaktion.decorator';
import { VerbrauchAggregatService } from './verbrauch-aggregat.service';
import { VerbrauchAggregatQueryDto } from './dto/verbrauch-aggregat-query.dto';
import type { VerbrauchAggregatAntwort } from './verbrauch-aggregat.types';

/**
 * `/messwerte/standorte/{standortId}/verbrauch` (schemas/openapi/messwerte.openapi.yaml)
 * — aggregierter, PII-freier Verbrauch je Standortknoten.
 *
 * `read:verbrauch_aggregat` (NEU, s. `auth/policy/policy-decision-port.ts`):
 * normales `betrieb`-Recht, KEIN break-glass (DS-07 schützt die Detailtiefe
 * des Lastgangs, nicht die Existenz einer Summe). `compliance-auditor`
 * erhält dieselbe aggregierte Sicht — analog `read:monitoring`
 * (`MonitoringController`). Reine Lese-Route OHNE `@AuditAction` (Konvention
 * `read:standort`/`read:monitoring`: der generische 403-Fallback
 * `authz.zugriff.verweigert` deckt abgelehnte Zugriffe bereits ab, M2).
 */
@Controller('messwerte/standorte')
export class VerbrauchAggregatController {
  constructor(private readonly verbrauchAggregatService: VerbrauchAggregatService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:verbrauch_aggregat')
  @Get(':standortId/verbrauch')
  async verbrauch(
    @Param('standortId') standortId: string,
    @Query() query: VerbrauchAggregatQueryDto,
  ): Promise<VerbrauchAggregatAntwort> {
    return this.verbrauchAggregatService.aggregiertePeriode(standortId, {
      von: query.von,
      bis: query.bis,
      aufloesung: query.aufloesung,
      ...(query.inklusiveUnterknoten !== undefined ? { inklusiveUnterknoten: query.inklusiveUnterknoten } : {}),
      ...(query.stichtag !== undefined ? { stichtag: query.stichtag } : {}),
    });
  }
}
