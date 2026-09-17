import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { foerderjahrBody, idempotencyKey, neuesTestJahr } from './test-support/nachweis-test-fixtures';

/**
 * Integrationstests (ECHTER Postgres-Testcontainer, ALLE `migrations/**`
 * inkl. V0024-V0026, Muster `berechnung/berechnungslauf.integration.spec.ts`)
 * für `nachweis.foerderjahr` (ADR-0007 D4/O1/B10).
 */
describe('Foerderjahr-Endpoint — Integrationstests (ADR-0007)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let auditorToken: string;
  let dbClient: Client;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-sub', ['compliance-auditor']);
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
  }, 120_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  it('legt ein Foerderjahr an, GET liefert es zurueck, Audit-Ereignis ohne PII', async () => {
    const jahr = neuesTestJahr();
    const code = `FJ-HAPPY-${randomUUID().slice(0, 8)}`;
    const response = await request(testApp.httpServer)
      .post('/nachweis/foerderjahre')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(foerderjahrBody(jahr, { code }));
    expect(response.status).toBe(201);
    const responseBody = response.body as { vonMonat: string; bisMonat: string; code: string; nummer: number; definitionQuelle: string };
    expect(responseBody.code).toBe(code);
    expect(responseBody.nummer).toBe(1);
    expect(responseBody.definitionQuelle).toBe('kalenderjahr');
    expect(responseBody.vonMonat.startsWith(`${jahr}-01-01`)).toBe(true);
    expect(responseBody.bisMonat.startsWith(`${jahr}-04-01`)).toBe(true);
    const foerderjahrId = (response.body as { id: string }).id;

    const getResponse = await request(testApp.httpServer)
      .get(`/nachweis/foerderjahre/${foerderjahrId}`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toEqual(response.body);

    // read:stammdaten -> auch compliance-auditor darf lesen.
    const auditorRead = await request(testApp.httpServer)
      .get(`/nachweis/foerderjahre/${foerderjahrId}`)
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(auditorRead.status).toBe(200);

    const auditRows = await dbClient.query(
      `SELECT event_typ, ergebnis, objekt_ref, kontext FROM audit.event
        WHERE event_typ = 'foerderjahr.stammdaten.definiert' AND kontext->>'foerderjahr_id' = $1`,
      [foerderjahrId],
    );
    expect(auditRows.rowCount).toBe(1);
    const row = auditRows.rows[0] as { objekt_ref: string; kontext: Record<string, unknown> };
    expect(row.objekt_ref).toBe(foerderjahrId);
    expect(row.kontext['foerderjahr_code']).toBe(code);
    expect(Object.keys(row.kontext)).not.toContain('endkunde_id');
  });

  it('legt ein TAGGENAUES Foerderjahr an — der Bewilligungszeitraum beginnt am 12.', async () => {
    // Kap. 9.1 des Technischen Merkblatts v2.2 verlangt die zeitanteilige
    // Ermittlung; ohne taggenaue Grenzen liesse sich ein Bescheid-Zeitraum
    // nur auf Monatsgrenzen runden.
    const jahr = neuesTestJahr();
    const response = await request(testApp.httpServer)
      .post('/nachweis/foerderjahre')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(
        foerderjahrBody(jahr, {
          vonMonat: `${jahr}-01-01`,
          // Der letzte enthaltene Tag ist der 11.01. des FOLGEJAHRES — also
          // ist dessen Januar der letzte Monat, nicht der Dezember davor.
          bisMonat: `${jahr + 1}-01-01`,
          vonTag: `${jahr}-01-12`,
          bisTag: `${jahr + 1}-01-12`,
          definitionQuelle: 'bewilligungszeitraum',
        }),
      );

    expect(response.status).toBe(201);
    const body = response.body as { vonTag: string; bisTag: string; vonMonat: string; bisMonat: string };
    expect(body.vonTag.startsWith(`${jahr}-01-12`)).toBe(true);
    expect(body.bisTag.startsWith(`${jahr + 1}-01-12`)).toBe(true);
    // Die Monatsfelder bleiben das Etikett — abgeleitet, nicht frei gesetzt.
    expect(body.vonMonat.startsWith(`${jahr}-01-01`)).toBe(true);
    expect(body.bisMonat.startsWith(`${jahr + 1}-01-01`)).toBe(true);
  });

  it('gibt auch ohne Tagesangabe taggenaue Grenzen zurueck — das volle Monatsfenster', async () => {
    const jahr = neuesTestJahr();
    const response = await request(testApp.httpServer)
      .post('/nachweis/foerderjahre')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(foerderjahrBody(jahr));

    expect(response.status).toBe(201);
    const body = response.body as { vonTag: string; bisTag: string };
    expect(body.vonTag.startsWith(`${jahr}-01-01`)).toBe(true);
    // bisMonat ist INKLUSIV (April), bisTag der erste Tag DANACH (1. Mai).
    expect(body.bisTag.startsWith(`${jahr}-05-01`)).toBe(true);
  });

  it('lehnt eine halbe Tagesangabe ab (400) — eine Grenze waere gerundet', async () => {
    const jahr = neuesTestJahr();
    const response = await request(testApp.httpServer)
      .post('/nachweis/foerderjahre')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(foerderjahrBody(jahr, { vonTag: `${jahr}-01-12` }));

    expect(response.status).toBe(400);
  });

  it('lehnt Tagesangaben ab, die nicht in den genannten Monaten liegen (400)', async () => {
    // Sonst wiese die Liste ein anderes Foerderjahr aus, als der Nachweis rechnet.
    const jahr = neuesTestJahr();
    const response = await request(testApp.httpServer)
      .post('/nachweis/foerderjahre')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(foerderjahrBody(jahr, { vonTag: `${jahr}-03-12`, bisTag: `${jahr}-05-12` }));

    expect(response.status).toBe(400);
  });

  it('lehnt einen doppelten Code ab (400)', async () => {
    const code = `FJ-DUP-${randomUUID().slice(0, 8)}`;
    const erster = await request(testApp.httpServer)
      .post('/nachweis/foerderjahre')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(foerderjahrBody(neuesTestJahr(), { code }));
    expect(erster.status).toBe(201);

    const zweiter = await request(testApp.httpServer)
      .post('/nachweis/foerderjahre')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(foerderjahrBody(neuesTestJahr(), { code }));
    expect(zweiter.status).toBe(400);
  });

  it('lehnt vonMonat/bisMonat ab, die KEINE Monatsanfaenge sind (400)', async () => {
    const code = `FJ-BADMONTH-${randomUUID().slice(0, 8)}`;
    const response = await request(testApp.httpServer)
      .post('/nachweis/foerderjahre')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(foerderjahrBody(neuesTestJahr(), { code, vonMonat: '2027-01-15' }));
    expect(response.status).toBe(400);
  });

  describe('Append-only-Nachweis (edms_app-DB-Rolle, 42501)', () => {
    it('UPDATE/DELETE auf nachweis.foerderjahr schlaegt fuer edms_app fehl', async () => {
      const code = `FJ-APPENDONLY-${randomUUID().slice(0, 8)}`;
      const response = await request(testApp.httpServer)
        .post('/nachweis/foerderjahre')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send(foerderjahrBody(neuesTestJahr(), { code }));
      expect(response.status).toBe(201);
      const foerderjahrId = (response.body as { id: string }).id;

      const appClient = new Client({ connectionString: testApp.container.getConnectionUri() });
      await appClient.connect();
      try {
        await appClient.query('SET ROLE edms_app');
        await expect(
          appClient.query(`UPDATE nachweis.foerderjahr SET nummer = 2 WHERE id = $1`, [foerderjahrId]),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(appClient.query(`DELETE FROM nachweis.foerderjahr WHERE id = $1`, [foerderjahrId])).rejects.toMatchObject({
          code: '42501',
        });
      } finally {
        await appClient.query('RESET ROLE').catch(() => undefined);
        await appClient.end();
      }
    });
  });
});
