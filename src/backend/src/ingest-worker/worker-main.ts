import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SyntheticOnlyConfigService } from '../stammdaten/synthetic/synthetic-only.config';
import { IngestBrokerModeConfig } from './config/ingest-broker-mode.config';
import { IngestWorkerModule } from './ingest-worker.module';
import { IngestWorkerRunnerService } from './ingest-worker-runner.service';

const logger = new Logger('IngestWorkerBootstrap');

/**
 * Bootstrap des eigenstaendigen EDMS-Ingest-Workers (ADR-0005 §18 D6, §19 D7).
 *
 * KEIN HTTP-Server — NestJS-Standalone-`ApplicationContext`
 * (`NestFactory.createApplicationContext`), analog `main.ts` (API-Bootstrap),
 * aber ohne `ValidationPipe`/`ProblemDetailsExceptionFilter`/`app.listen()`
 * (kein HTTP-Request-Pfad im Worker).
 *
 * **Reihenfolge (verbindlich, ADR-0005 §19):**
 *   1. Fail-closed-Selbstcheck — `SyntheticOnlyConfigService` +
 *      `IngestBrokerModeConfig` werden HIER bewusst als PLAIN JS-Objekte
 *      instanziiert (kein Nest-DI) — GARANTIERT, dass der Check als
 *      ALLERERSTES im Prozess laeuft, unabhaengig davon, in welcher
 *      Reihenfolge Nest den `IngestWorkerModule`-Graph konstruieren wuerde.
 *      Wirft eine der beiden Klassen (ungueltige/widerspruechliche
 *      ENV-Kombination), bricht der Prozess HIER ab — es wurde noch KEINE
 *      MQTT-Verbindung geoeffnet und KEIN DB-Pool erzeugt.
 *   2. `NestFactory.createApplicationContext(IngestWorkerModule)` — baut den
 *      Rest des Objektgraphen (DB-Pool via `IngestPgModule`, MQTT-Adapter via
 *      `IngestMqttModule`) — beide sind an dieser Stelle noch NICHT
 *      tatsaechlich verbunden (`pg.Pool` verbindet lazy beim ersten Query,
 *      der `mqtt`-Client verbindet erst in Schritt 3).
 *   3. `runner.start()` — HIER (und erst hier) verbindet der MQTT-Adapter
 *      tatsaechlich zum Broker.
 *
 * Log beim Start: NUR Modus-Werte (`envClass`, `syntheticOnly`,
 * `brokerMode`) — NIE Secrets/Credentials (RL-2/backend-nestjs.md).
 */
async function bootstrap(): Promise<void> {
  const syntheticOnlyConfig = new SyntheticOnlyConfigService();
  const brokerModeConfig = new IngestBrokerModeConfig(syntheticOnlyConfig);

  logger.log(
    `Ingest-Worker Startup-Selbstcheck bestanden — envClass=${syntheticOnlyConfig.envClass}, ` +
      `syntheticOnly=${String(syntheticOnlyConfig.syntheticOnly)}, brokerMode=${brokerModeConfig.mode} ` +
      '(keine Secrets/Credentials geloggt, RL-2).',
  );

  const app = await NestFactory.createApplicationContext(IngestWorkerModule);

  // BEWUSST KEIN `app.enableShutdownHooks()`.
  //
  // Es registriert EIGENE Signal-Handler, die `app.close()` aufrufen — neben
  // dem Handler weiter unten, der dasselbe tut. Beim Betrieb als Container
  // (ADR-0011 C3) fiel auf, was das bedeutet: Beide Pfade laufen bei einem
  // `SIGTERM` los, `IngestPgModule.onApplicationShutdown()` schliesst den
  // Verbindungspool zweimal, und der geordnete Shutdown endet mit
  //   „Called end on pool more than once"
  // und EXIT-CODE 1. Der zuerst laufende Nest-Pfad schliesst den Pool zudem,
  // BEVOR `runner.stop()` seinen letzten Herzschlag (`verbunden=false`)
  // schreiben kann — genau die Meldung, an der die Betriebssicht einen
  // sauberen Halt von einem Absturz unterscheidet (ADR-0011 O8).
  //
  // Als handgestarteter Prozess blieb das folgenlos; als ueberwachter Dienst
  // waere jeder normale Stopp ein Absturz gewesen (`restart: unless-stopped`
  // wertet Exit != 0 aus), und ein echter Fehlschlag haette sich davon nicht
  // mehr unterschieden.
  //
  // Der Handler unten deckt beide Signale ab und haelt die Reihenfolge, auf
  // die es ankommt: erst die Verbraucher anhalten und den Schlusszustand
  // melden, DANN die Anwendung (und mit ihr den Pool) schliessen.
  // `app.close()` loest die Lifecycle-Hooks ohnehin aus — dafuer braucht es
  // `enableShutdownHooks()` nicht.

  const runner = app.get(IngestWorkerRunnerService);
  await runner.start();

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.log(`Signal ${signal} empfangen — graceful shutdown (laufende Verarbeitung wird abgeschlossen, §15).`);
    runner
      .stop()
      .then(() => app.close())
      .then(() => {
        process.exit(0);
      })
      .catch((error: unknown) => {
        logger.error(`Fehler beim graceful shutdown: ${error instanceof Error ? error.message : 'unbekannt'}`);
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
}

bootstrap().catch((error: unknown) => {
  // Bootstrap-Fehler (u. a. der Fail-closed-Selbstcheck) landen NUR im
  // lokalen Prozess-Log — analog main.ts (API-Bootstrap).
  console.error('EDMS ingest-worker failed to start:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
