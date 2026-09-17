import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { ErhebungsEntscheidungService } from './erhebungs-entscheidung.service';
import type { ErhebungsEntscheidungReport } from './erhebungs-entscheidung.service';

/**
 * `/monitoring/erhebungs-entscheidungen` — Auflage C-8: welche
 * Art.-18-Sperren wirken auf die Messung, und wo steht die Entscheidung
 * darueber noch aus.
 *
 * Eigener Endpunkt statt einer Erweiterung von
 * `/monitoring/einschraenkung-fristen`: Jener beantwortet „laeuft diese
 * Einschraenkung laenger als vorgesehen?", dieser „wirkt hier eine
 * Entscheidung ueber die Messung, und hat sie jemand getroffen?". Die
 * Gruende ueberschneiden sich zufaellig bei lit. d, die Fragen nicht — und
 * der Kommentar zur Fristenueberwachung warnt ausdruecklich davor, ihre
 * Liste zu Rauschen zu verbreitern.
 *
 * KEINE Query-Parameter: Anders als bei der Wiedervorlage gibt es hier
 * keine Schwelle, die man anders schneiden koennte. Eine offene Entscheidung
 * ist ab dem ersten Tag offen.
 *
 * `read:monitoring`, beide Rollen — fuer `compliance-auditor` ist gerade die
 * Spalte `entscheidung_offen` interessant: eine Sperre, bei der die Messung
 * unbemerkt weiterlaeuft, ist eine Aufsichtsfrage (Art. 5 Abs. 2).
 *
 * Der Report traegt KEINE PII: Pseudonym-UUIDs, geschlossener Grund-Code,
 * Zeitangaben, ein Zustand aus drei Werten.
 *
 * KEIN `@AuditAction` — reiner Lese-Report ueber Metadaten, wie die
 * uebrigen Monitoring-Endpunkte.
 */
@Controller('monitoring/erhebungs-entscheidungen')
export class ErhebungsEntscheidungController {
  constructor(private readonly service: ErhebungsEntscheidungService) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:monitoring')
  @Get()
  async report(): Promise<ErhebungsEntscheidungReport> {
    return this.service.report();
  }
}
