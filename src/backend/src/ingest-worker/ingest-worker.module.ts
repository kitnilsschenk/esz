import { Module } from '@nestjs/common';
import { IngestMqttModule } from './mqtt/mqtt.module';
import { IngestPersistenceModule } from './persistence/ingest-persistence.module';
import { IngestFlowModule } from './ingest-flow/ingest-flow.module';
import { QuelleHerzschlagService } from './quelle-herzschlag.service';
import { IngestWorkerRunnerService } from './ingest-worker-runner.service';

/**
 * ADR-0005 §18 (D6) — Root-Modul des eigenstaendigen Ingest-Worker-Prozesses.
 * Importiert BEWUSST NICHT `AppModule`/`StammdatenModule` (die tragen die
 * HTTP-/ABAC-/`edms_app`-Maschinerie der API, s. `app.module.ts`/
 * `stammdaten.module.ts`) — der Worker hat keinen HTTP-Request-Pfad und
 * verbindet ueber eine KOMPLETT SEPARATE, least-privilege DB-Rolle
 * (`edms_ingest_worker`, RL-1, s. `persistence/ingest-database.config.ts`).
 *
 * Der Fail-closed-Selbstcheck (`SyntheticOnlyConfigService` +
 * `IngestBrokerModeConfig`) laeuft NICHT ueber dieses Modul, sondern als
 * PLAIN-JS-Instanziierung VOR `NestFactory.createApplicationContext(...)`
 * in `worker-main.ts` — s. dortiger Kommentar fuer die Begruendung
 * (garantierte Reihenfolge, unabhaengig von der Nest-Modul-Graph-
 * Konstruktionsreihenfolge).
 */
@Module({
  // `IngestPersistenceModule` fuer den Herzschlag (ADR-0011 O8): Er schreibt
  // seine Statuszeile ueber `QuelleStatusRepository` und braucht damit den
  // Pool — anders als `IngestWorkerRunnerService`, der nur koordiniert.
  imports: [IngestMqttModule, IngestFlowModule, IngestPersistenceModule],
  providers: [IngestWorkerRunnerService, QuelleHerzschlagService],
  exports: [IngestWorkerRunnerService],
})
export class IngestWorkerModule {}
