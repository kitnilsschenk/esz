import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HealthTestApp } from './test-support/health-test-app';
import { startHealthTestApp, stopHealthTestApp } from './test-support/health-test-app';

/**
 * Integrationstest gegen einen ECHTEN Postgres+TimescaleDB-Testcontainer
 * (ADR-0001 §10.5, dasselbe Image wie deployment/docker/docker-compose.dev.yml)
 * — KEIN DB-Mock (.claude/rules/tests.md). Deckt Happy- und Fehlerfall des
 * Controllers ab (Health-Test-Checkliste, ADR-0001 §10.7).
 *
 * Voraussetzung: laufender Docker-Daemon. Ohne Docker scheitert `beforeAll`
 * mit der unveränderten Testcontainers-Fehlermeldung (kein Auto-Skip).
 */
describe('GET /health und /health/ready (Testcontainers PG+TimescaleDB, ADR-0001 §10.5)', () => {
  let testApp: HealthTestApp;

  beforeAll(async () => {
    testApp = await startHealthTestApp();
  }, 120_000);

  afterAll(async () => {
    await stopHealthTestApp(testApp);
  });

  it('liefert 200 auf GET /health, solange der Prozess läuft (Liveness, keine Abhängigkeitsprüfung)', async () => {
    const response = await request(testApp.httpServer).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('liefert 200 auf GET /health/ready, wenn PostgreSQL erreichbar ist (Happy-Fall)', async () => {
    const response = await request(testApp.httpServer).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      checks: { database: { status: 'up', detail: 'ready' } },
    });
  });

  it('liefert 503 application/problem+json auf GET /health/ready, wenn die Datenbank gestoppt ist (Fehlerfall)', async () => {
    await testApp.container.stop();

    const response = await request(testApp.httpServer).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      type: 'https://edms.example/problems/dependency-unavailable',
      title: 'Service Unavailable',
      status: 503,
      detail: 'A required dependency is not ready.',
    });

    // Regressions-/Topologie-Leak-Guard (backend-lead-Finding "hoch"): keine
    // rohen Verbindungsdetails im Fehler-Body.
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(testApp.container.getHost());
  }, 20_000);
});
