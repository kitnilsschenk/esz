import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { EinschraenkungFristService } from './einschraenkung-frist.service';
import type { EinschraenkungFristReport } from './einschraenkung-frist.service';
import { EinschraenkungFristQueryDto } from './dto/einschraenkung-frist-query.dto';

/**
 * `/monitoring/einschraenkung-fristen` — Wiedervorlage der BEFRISTETEN
 * Art.-18-Tatbestaende (ADR-0007 A11.11).
 *
 * `read:monitoring` und BEIDE Rollen, wie beim Vollstaendigkeits-Report: fuer
 * `compliance-auditor` ist diese Liste sogar der interessantere Fall — „laeuft
 * hier eine Einschraenkung stillschweigend weiter, obwohl ihr Grund entfallen
 * ist?" ist eine Aufsichtsfrage (Art. 5 Abs. 1 lit. e).
 *
 * Der Report traegt KEINE PII: nur Pseudonym-UUIDs, den geschlossenen
 * Grund-Code und Zeitangaben. Kein Grund fuer eine PII-Projektion, kein
 * break-glass.
 *
 * KEIN `@AuditAction`: ein reiner Lese-Report ueber Metadaten, wie
 * `MonitoringController.liste()` — die Audit-Pflicht trifft state-aendernde
 * Methoden (`backend-nestjs.md`).
 */
@Controller('monitoring/einschraenkung-fristen')
export class EinschraenkungFristController {
  constructor(private readonly fristService: EinschraenkungFristService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:monitoring')
  @Get()
  async report(@Query() query: EinschraenkungFristQueryDto): Promise<EinschraenkungFristReport> {
    return this.fristService.report(query.schwelleTage);
  }
}
