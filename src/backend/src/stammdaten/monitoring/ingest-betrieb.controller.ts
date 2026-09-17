import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { resolveLimit } from '../common/list-query.dto';
import type { Seite } from '../common/seite.dto';
import { IngestBetriebService } from './ingest-betrieb.service';
import { IngestQuarantaeneListQueryDto } from './dto/ingest-quarantaene-list-query.dto';
import type { IngestQuarantaeneItem, IngestStatus } from './ingest-betrieb.types';

/**
 * `/monitoring/ingest/*` (ADR-0011 A2) — die Betriebssicht auf die
 * Messdaten-Aufnahme.
 *
 * Bewusst unter `/monitoring` und mit der BESTEHENDEN Aktion
 * `read:monitoring`: Es ist derselbe Betriebs-Blick auf dieselben
 * Ingest-Tabellen wie `/monitoring/vollstaendigkeit` (DE-02) und
 * `/monitoring/ausfaelle` (TB-04) — eine eigene PDP-Aktion wäre neue
 * Rechte-Fläche ohne neuen Schutzbedarf. Rollen entsprechend
 * `betrieb`/`compliance-auditor`, alles PII-frei.
 */
@Controller('monitoring/ingest')
export class IngestBetriebController {
  constructor(private readonly ingestBetriebService: IngestBetriebService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:monitoring')
  @Get('status')
  async status(): Promise<IngestStatus> {
    return this.ingestBetriebService.status();
  }

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:monitoring')
  @Get('quarantaene')
  async quarantaene(@Query() query: IngestQuarantaeneListQueryDto): Promise<Seite<IngestQuarantaeneItem>> {
    return this.ingestBetriebService.quarantaene({
      ...(query.grund !== undefined ? { grund: query.grund } : {}),
      ...(query.quelle !== undefined ? { quelleCode: query.quelle } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      limit: resolveLimit(query.limit),
    });
  }
}
