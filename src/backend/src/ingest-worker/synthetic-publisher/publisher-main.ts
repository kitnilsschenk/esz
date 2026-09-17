import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { SyntheticOnlyConfigService } from '../../stammdaten/synthetic/synthetic-only.config';
import { SyntheticUplinkPublisherService } from './synthetic-uplink-publisher.service';

const logger = new Logger('SyntheticPublisherBootstrap');

/** DSFA-0001 §1 Beispiel-Kadenz (ADR-0005 §16) — alle 15 min je synthetischem Geraet. */
const DEFAULT_INTERVALL_MS = 15 * 60 * 1000;

/**
 * Eigenstaendiger Dev-Betrieb-Entrypoint des synthetischen Uplink-Publishers
 * (ADR-0005 §16, D4). NICHT Teil der Produktivpipeline — Vorschlag fuer den
 * Dev-Compose-Stack (s. Auslieferungsbericht Aufgabe F, NICHT in
 * `deployment/**` angewendet).
 *
 * Fail-closed (analog `worker-main.ts`): `SyntheticOnlyConfigService` wird
 * als ALLERERSTES, PLAIN-JS instanziiert — VOR jeglichem MQTT-Connect.
 */
/**
 * Zaehlerstand, ab dem der Simulator hochzaehlt.
 *
 * **Warum das konfigurierbar sein MUSS.** Der Publisher begann fruEher bei
 * jedem Start wieder bei 1. Ein kumulativer Zaehlerstand darf aber nie
 * zurueckspringen — genau dafuer ist die Monotonie-Pruefung der Aufnahme
 * gebaut. Sie tat also ihre Arbeit und wies jeden Uplink ab, sobald der Kanal
 * schon einen hoeheren Stand hatte: nach einem Neustart des Simulators, und
 * erst recht gegen einen Demo-Bestand, der bei 172 860 kWh steht
 * (beobachtet 2026-09-08). Sichtbar war davon nichts ausser einer Warnzeile.
 *
 * Ein reales Geraet springt nicht auf Null; es meldet den Stand des Zaehlwerks,
 * an dem es haengt. Wer den Simulator an einen bestehenden Kanal haengt, setzt
 * hier den dort erreichten Stand ein.
 */
function startZaehlerstand(): number {
  const roh = process.env['EDMS_SYNTHETIC_PUBLISHER_STARTWERT'];
  if (roh === undefined || roh.length === 0) {
    return 0;
  }
  const wert = Number.parseFloat(roh);
  if (!Number.isFinite(wert) || wert < 0) {
    throw new Error(
      `EDMS_SYNTHETIC_PUBLISHER_STARTWERT="${roh}" ist kein nicht-negativer Zahlenwert. Der Startwert ist ein ` +
        'Zaehlerstand — ein unplausibler hier faellt erst in der Aufnahme auf, als abgewiesener Uplink.',
    );
  }
  return wert;
}

async function bootstrap(): Promise<void> {
  const syntheticOnlyConfig = new SyntheticOnlyConfigService();

  const devEui = process.env['EDMS_SYNTHETIC_PUBLISHER_DEVEUI'];
  if (devEui === undefined || devEui.length === 0) {
    throw new Error(
      'EDMS_SYNTHETIC_PUBLISHER_DEVEUI ist nicht gesetzt — der synthetische Publisher braucht die DevEUI eines ' +
        'bereits provisionierten Test-Geraets (device.geraet_zuordnung).',
    );
  }

  const intervalMs = Number.parseInt(process.env['EDMS_SYNTHETIC_PUBLISHER_INTERVALL_MS'] ?? '', 10);
  const effektiverIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_INTERVALL_MS;

  logger.log(
    `Synthetischer Publisher startet — envClass=${syntheticOnlyConfig.envClass}, ` +
      `intervalMs=${String(effektiverIntervalMs)} (keine Secrets geloggt).`,
  );

  const publisher = new SyntheticUplinkPublisherService(syntheticOnlyConfig);
  await publisher.connect();
  logger.log('Synthetischer Publisher verbunden.');

  let zaehlerstand = startZaehlerstand();
  publisher.startIntervalPublishing(effektiverIntervalMs, () => {
    zaehlerstand += 1;
    return { devEui, wertRoh: zaehlerstand, deviceTimestampIso: new Date().toISOString() };
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.log(`Signal ${signal} empfangen — Publisher wird beendet.`);
    publisher
      .disconnect()
      .then(() => {
        process.exit(0);
      })
      .catch(() => {
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
  console.error('EDMS synthetic-publisher failed to start:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
