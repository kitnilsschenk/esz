import { Module } from '@nestjs/common';
import { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';
import { SyntheticOnlyInterceptor } from '../stammdaten/synthetic/synthetic-only.interceptor';
import { NachweisFoerderjahrRepository } from '../nachweis/persistence/nachweis-foerderjahr.repository';
import { GeraeteerkennungController } from './geraeteerkennung.controller';
import { GeraeteerkennungService } from './geraeteerkennung.service';
import { GeraeteerkennungRepository } from './persistence/geraeteerkennung.repository';

/**
 * TB-05 — Identifikation von Geraete- und Anlagengruppen ([Q3] Kap. 5).
 *
 * Eigener fachlicher Kontext, obwohl die Tabellen im `energy`-Schema liegen:
 * Die Zuordnung ist kein Stammdatum, das man pflegt, sondern eine
 * NACHWEISFUEHRENDE Aussage. Jeder Vorgang veraendert die Quote, mit der
 * gegenueber der Bewilligungsbehoerde belegt wird, dass 20 bis 40 Prozent des
 * Jahresverbrauchs zugeordnet werden koennen -- und deshalb traegt jeder ein
 * Pflicht-Audit-Ereignis.
 *
 * `NachweisFoerderjahrRepository` wird erneut als Provider deklariert
 * (zustandsloser `TransactionHost`-Wrapper, Muster aus `consent`/`nutzerinfo`):
 * Die Sollquote haengt am PROJEKTJAHR, und das steht in `nachweis.foerderjahr`.
 * Sie hier zweitzurechnen hiesse, den Zeitraum an zwei Stellen zu definieren.
 */
@Module({
  controllers: [GeraeteerkennungController],
  providers: [
    GeraeteerkennungService,
    GeraeteerkennungRepository,
    NachweisFoerderjahrRepository,
    SyntheticOnlyConfigService,
    SyntheticOnlyInterceptor,
  ],
  exports: [GeraeteerkennungService],
})
export class GeraeteerkennungModule {}
