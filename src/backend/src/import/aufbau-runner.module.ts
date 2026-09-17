import { Module } from '@nestjs/common';
import { PersistenceModule } from '../common/persistence/persistence.module';
import { AuditModule } from '../audit/audit.module';
import { StammdatenModule } from '../stammdaten/stammdaten.module';
import { BerechnungModule } from '../berechnung/berechnung.module';
import { NachweisModule } from '../nachweis/nachweis.module';
import { RetentionModule } from '../retention/retention.module';
import { GeraeteerkennungModule } from '../geraeteerkennung/geraeteerkennung.module';

/** Modulschnitt des einmaligen Aufbau-Skripts (`aufbau-pilotbestand-a.ts`). */
@Module({
  imports: [
    PersistenceModule,
    AuditModule,
    StammdatenModule,
    BerechnungModule,
    NachweisModule,
    RetentionModule,
    GeraeteerkennungModule,
  ],
})
export class AufbauRunnerModule {}
