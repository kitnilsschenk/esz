import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';

/**
 * ADR-0005 (Aufgabe E) — Testcontainer-`eclipse-mosquitto` fuer
 * Integration-/E2E-Tests. Bewusst NICHT die Dev-Compose (die bleibt
 * unangetastet, s. Auslieferungsbericht Aufgabe F) — nur fuer diesen
 * Testlauf, eigenes, isoliertes Container-Leben.
 *
 * `allow_anonymous true` — NUR fuer den Testcontainer (kurzlebig, kein
 * Netzwerk-Zugriff von aussen, kein produktionsnahes Profil): vereinfacht
 * den Testaufbau, OHNE Credentials im Testcode/Repo zu hinterlegen. Das
 * produktive TLS/mTLS-Profil (SEC-2, ADR-0005 §17) ist NICHT Teil dieses
 * Testcontainers — s. Aufgabe-F-Deployment-Entwurf im Bericht.
 */
const MOSQUITTO_IMAGE = 'eclipse-mosquitto:2.0.18';
const MOSQUITTO_PORT = 1883;

const MOSQUITTO_CONF = ['listener 1883', 'allow_anonymous true', 'persistence false', 'log_dest stdout', ''].join('\n');

export interface StartedTestMosquitto {
  readonly container: StartedTestContainer;
  readonly url: string;
}

export async function startTestMosquitto(): Promise<StartedTestMosquitto> {
  const container = await new GenericContainer(MOSQUITTO_IMAGE)
    .withExposedPorts(MOSQUITTO_PORT)
    .withCopyContentToContainer([{ content: MOSQUITTO_CONF, target: '/mosquitto/config/mosquitto.conf' }])
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(MOSQUITTO_PORT);

  return { container, url: `mqtt://${host}:${port}` };
}

export async function stopTestMosquitto(started: StartedTestMosquitto): Promise<void> {
  await started.container.stop().catch(() => undefined);
}
