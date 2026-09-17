import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { resolveLimit } from '../common/list-query.dto';
import type { Seite } from '../common/seite.dto';
import { IngestFreshnessService } from './ingest-freshness.service';
import { AusfallListQueryDto } from './dto/ausfall-list-query.dto';
import type { AusfallListeItem } from './ingest-freshness.types';

/**
 * `/monitoring/ausfaelle` (stammdaten.openapi.yaml, ADR-0005 §27/TB-04) —
 * Backend-Lücke 2 (Dashboard-Kachel „Zähler mit Datenausfall", UX-Konzept
 * Priorität 1). Orientiert sich 1:1 an `MonitoringController`
 * (`/monitoring/vollstaendigkeit`): gleiche ABAC-Aktion `read:monitoring`
 * (ADR-0005 §27 bestätigt ausdrücklich „kein neuer PDP-Fall nötig" — DE-02
 * und TB-04 laufen innerhalb derselben Aktion), gleiche Rollen, gleiches
 * Cursor-Pagination-/`Seite<T>`-Muster, aggregiert und PII-frei.
 */
@Controller('monitoring/ausfaelle')
export class AusfallController {
  constructor(private readonly ingestFreshnessService: IngestFreshnessService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:monitoring')
  @Get()
  async liste(@Query() query: AusfallListQueryDto): Promise<Seite<AusfallListeItem>> {
    return this.ingestFreshnessService.listeUeberfaellig({
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      limit: resolveLimit(query.limit),
    });
  }
}
