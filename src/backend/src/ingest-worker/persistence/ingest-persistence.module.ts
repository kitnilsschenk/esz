import { Module } from '@nestjs/common';
import { IngestPgModule } from './ingest-pg.module';
import { DeviceForwardLookupRepository } from './device-forward-lookup.repository';
import { EnergyStammdatenLookupRepository } from './energy-stammdaten-lookup.repository';
import { HerkunftAbgleichRepository } from './herkunft-abgleich.repository';
import { MesswertSchreibpfadRepository } from './messwert-schreibpfad.repository';
import { QuelleStatusRepository } from './quelle-status.repository';
import { IngestQuelleKonfigRepository } from './ingest-quelle-konfig.repository';
import { IngestQuarantaeneRepository } from './ingest-quarantaene.repository';
import { ConsentGateRepository } from './consent-gate.repository';
import { VerwurfAggregatRepository } from './verwurf-aggregat.repository';
import { IngestLoggerService } from '../ingest-flow/ingest-logger.service';

/**
 * Buendelt die vier Ingest-Worker-Repositories (RL-1, `edms_ingest_worker`
 * least-privilege Verbindung, s. `ingest-pg.module.ts`) fuer den Import
 * durch `IngestFlowModule`.
 *
 * `IngestLoggerService` wird BEWUSST HIER (statt in `IngestFlowModule`)
 * bereitgestellt/exportiert (SA-5/QA-3-Nacharbeit, Phase-5-Review): sowohl
 * `MesswertSchreibpfadRepository` (SA-5 — Rollback-Fehler-Logging) als auch
 * `MqttSubscriberAdapter` (QA-3 — `infraFehler()`-Verdrahtung, `IngestMqttModule`
 * importiert dieses Modul dafuer) brauchen den PII-sicheren Structured-
 * Logger, OHNE dass `IngestMqttModule` dafuer die schwerere `IngestFlowModule`-
 * Importkette (inkl. `CryptoModule`) mitziehen muesste — EIN kanonischer
 * Bereitstellungsort statt mehrerer unabhaengiger Provider-Instanzen
 * desselben (zustandslosen) Loggers.
 */
@Module({
  imports: [IngestPgModule],
  providers: [
    QuelleStatusRepository,
    DeviceForwardLookupRepository,
    EnergyStammdatenLookupRepository,
    HerkunftAbgleichRepository,
    MesswertSchreibpfadRepository,
    IngestQuarantaeneRepository,
    IngestQuelleKonfigRepository,
    ConsentGateRepository,
    VerwurfAggregatRepository,
    IngestLoggerService,
  ],
  exports: [
    QuelleStatusRepository,
    DeviceForwardLookupRepository,
    EnergyStammdatenLookupRepository,
    HerkunftAbgleichRepository,
    MesswertSchreibpfadRepository,
    IngestQuarantaeneRepository,
    IngestQuelleKonfigRepository,
    ConsentGateRepository,
    VerwurfAggregatRepository,
    IngestLoggerService,
  ],
})
export class IngestPersistenceModule {}
