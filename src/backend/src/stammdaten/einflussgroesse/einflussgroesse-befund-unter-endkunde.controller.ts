import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { EinflussgroesseService } from './einflussgroesse.service';
import type { EinflussgroesseBefundItem } from './einflussgroesse.types';

/**
 * `/stammdaten/endkunden/{endkundeId}/einflussgroessen/befunde` (ADR-0006
 * Teil B, B8/B10) — `read:einflussgroesse`. v1 NUR LESEND (Scope-Grenze, s.
 * `EinflussgroesseService`-Klassen-Dok: die Schwellwert-**Erkennung**
 * [`einfluss.befund`-INSERT + `einflussgroesse.schwellwert.ueberschritten`]
 * ist NICHT Teil dieses Pakets). `@Roles('betrieb')` NUR (Auditor-Deny,
 * analog `EinflussgroesseUnterSystemController`). KEIN `@AuditAction` — der
 * gelesene `einfluss.befund` trägt KEINE PII/Klartext-Einflussgrößen-Werte
 * (nur eine klassierte Schwellwertüberschreitung, B10/B12.5); anders als die
 * `.einsicht`-Route unter `.../systeme/{systemId}/einflussgroessen` ist dies
 * daher kein "Klartext-PII-Lesen" im B10-Sinn (der Arbeitsauftrag listet für
 * DIESE Route explizit KEIN `@AuditAction`).
 */
@Controller('stammdaten/endkunden/:endkundeId/einflussgroessen/befunde')
export class EinflussgroesseBefundUnterEndkundeController {
  constructor(private readonly einflussgroesseService: EinflussgroesseService) {}

  @Roles('betrieb')
  @Fachaktion('read:einflussgroesse')
  @Get()
  async befunde(@Param('endkundeId') endkundeId: string): Promise<EinflussgroesseBefundItem[]> {
    return this.einflussgroesseService.befundeFuerEndkunde(endkundeId);
  }
}
