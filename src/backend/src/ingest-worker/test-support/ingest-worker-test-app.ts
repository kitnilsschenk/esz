import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IngestWorkerModule } from '../ingest-worker.module';
import { IngestWorkerRunnerService } from '../ingest-worker-runner.service';
import { IngestMetricsService } from '../ingest-flow/ingest-metrics.service';

export interface IngestWorkerTestApp {
  readonly app: INestApplicationContext;
  readonly runner: IngestWorkerRunnerService;
  readonly metrics: IngestMetricsService;
}

/**
 * Test-Support: bootet den ECHTEN `IngestWorkerModule`-Objektgraphen
 * (Standalone-`ApplicationContext`, KEIN HTTP) UND startet den MQTT-
 * Subscriber (`runner.start()`) — der Aufrufer MUSS vorher ALLE benoetigten
 * ENV-Variablen setzen (`EDMS_INGEST_DATABASE_URL`, `EDMS_INGEST_MQTT_URL`,
 * `EDMS_DEV_KMS_MASTER_KEY`, `EDMS_DEV_BLIND_INDEX_PEPPER` — die letzten
 * beiden, weil `IngestFlowModule` `CryptoModule` importiert und dessen
 * Dev-Adapter beim Bootstrap eagerly/fail-closed konstruiert werden, auch
 * wenn der Worker `FieldCipherService`/`LocalDevKmsAdapter` selbst nie
 * aufruft, s. `ingest-flow.module.ts`-Kommentar).
 *
 * Der Fail-closed-Selbstcheck (`SyntheticOnlyConfigService`/
 * `IngestBrokerModeConfig`) ist HIER bewusst NICHT enthalten — das ist
 * ausschliesslich `worker-main.ts`s Verantwortung (Prozess-Bootstrap); ein
 * Test, der genau DIESES Verhalten prueft, konstruiert die beiden Klassen
 * direkt (s. `config/ingest-broker-mode.config.spec.ts`).
 */
export async function startIngestWorkerTestApp(): Promise<IngestWorkerTestApp> {
  const app = await NestFactory.createApplicationContext(IngestWorkerModule, { logger: false });
  const runner = app.get(IngestWorkerRunnerService);
  const metrics = app.get(IngestMetricsService);

  await runner.start();

  return { app, runner, metrics };
}

export async function stopIngestWorkerTestApp(started: IngestWorkerTestApp): Promise<void> {
  await started.runner.stop().catch(() => undefined);
  await started.app.close().catch(() => undefined);
}
