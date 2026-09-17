import { Module } from '@nestjs/common';
import { PersistenceModule } from '../common/persistence/persistence.module';
import { AuditModule } from '../audit/audit.module';
import { StammdatenModule } from '../stammdaten/stammdaten.module';
import { NutzerinfoModule } from '../nutzerinfo/nutzerinfo.module';
import { PortalModule } from '../portal/portal.module';

/** Modulschnitt des Kundenweg-Skripts (`kundenweg-pilotbestand-a.ts`). */
@Module({
  imports: [PersistenceModule, AuditModule, StammdatenModule, NutzerinfoModule, PortalModule],
})
export class KundenwegRunnerModule {}
