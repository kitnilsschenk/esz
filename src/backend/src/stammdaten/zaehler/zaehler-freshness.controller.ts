import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { IngestFreshnessService } from '../monitoring/ingest-freshness.service';
import type { MesskanalFreshnessItem } from '../monitoring/ingest-freshness.types';

/**
 * `/stammdaten/zaehler/{zaehlerId}/freshness` (stammdaten.openapi.yaml,
 * ADR-0005 §27/TB-04) — Backend-Lücke 2, zweiter Teil: Zähler-Detailseite
 * (UX-Konzept Block 3 „Datenfluss-Status" + Messkanäle-Tabellen-Spalte
 * „Letzte Übertragung"). ABAC-Aktion `read:monitoring` — BEWUSST NICHT
 * `read:verbrauch_detail` (kein Messwert, kein Lastgang; „wann kam
 * zuletzt etwas an" ist ein Betriebs-Metadatum, s.
 * `IngestFreshnessService.freshnessJeMesskanal()`-Dok) — dieser Endpunkt
 * ist daher OHNE break-glass (kein `X-Edms-Zugriffszweck`-Header) erreichbar.
 */
@Controller('stammdaten/zaehler/:zaehlerId/freshness')
export class ZaehlerFreshnessController {
  constructor(private readonly ingestFreshnessService: IngestFreshnessService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:monitoring')
  @Get()
  async freshness(@Param('zaehlerId') zaehlerId: string): Promise<MesskanalFreshnessItem[]> {
    return this.ingestFreshnessService.freshnessJeMesskanal(zaehlerId);
  }
}
