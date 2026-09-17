import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer, KEIN
 * DB-Mock, `.claude/rules/tests.md`) für den `SystemController`
 * (`/stammdaten/systeme`) — schließt die Merge-Blocker-Lücke aus dem
 * Phase-4-Review (`stammdaten.integration.spec.ts` deckte bislang nur
 * Endkunde ab). Muster 1:1 aus `stammdaten.integration.spec.ts` übernommen.
 * Deckt zusätzlich die idempotente Stilllegung ab (Linie 3, kein
 * Hard-Delete, ADR-0008 §12 Nachtrag — `energy.system.status` seit V0005,
 * jetzt exponiert + per DELETE schaltbar, analog `ZaehlerController`).
 */
describe('SystemController — Integrationstests (ADR-0008 Teil B, Phase 4)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let auditorToken: string;
  let adminToken: string;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-sub', ['compliance-auditor']);
    adminToken = await testApp.signToken('admin-sub', ['admin']);
  }, 120_000);

  afterAll(async () => {
    await stopStammdatenTestApp(testApp);
  });

  function idempotencyKey(): string {
    return randomUUID();
  }

  async function legeEndkundeAn(namenSuffix: string): Promise<{ id: string }> {
    const response = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        stammdatenPii: {
          name: `Testkunde Musterfirma ${namenSuffix}`,
          anschrift: 'Musterstraße 1, 12345 Musterstadt',
        },
      });

    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id };
  }

  async function legeSystemAn(endkundeId: string, bezeichnungSuffix: string): Promise<{ id: string }> {
    const response = await request(testApp.httpServer)
      .post('/stammdaten/systeme')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ endkundeId, bezeichnung: `Testsystem ${bezeichnungSuffix}`, systemgrenze: 'Gebäude Musterhalle' });

    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id };
  }

  describe('System — Anlegen/Lesen/Aendern/Stilllegen (CRUD, ADR-0008 §12 Nachtrag)', () => {
    it('POST legt ein System an, wenn der Endkunde existiert (Happy Path)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Alpha');

      const response = await request(testApp.httpServer)
        .post('/stammdaten/systeme')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ endkundeId, bezeichnung: 'Testsystem Halle 1', systemgrenze: 'Gebäude Musterhalle 1' });

      expect(response.status).toBe(201);
      expect(response.headers['location']).toBe(`/stammdaten/systeme/${(response.body as { id: string }).id}`);
      expect(response.body).toMatchObject({
        endkundeId,
        bezeichnung: 'Testsystem Halle 1',
        systemgrenze: 'Gebäude Musterhalle 1',
        status: 'aktiv',
      });
    });

    it('POST lehnt ab (404), wenn der referenzierte Endkunde nicht existiert', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/systeme')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ endkundeId: randomUUID(), bezeichnung: 'Testsystem Waise', systemgrenze: 'Gebäude X' });

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it('GET Detail liefert 404 fuer eine unbekannte System-ID', async () => {
      const response = await request(testApp.httpServer)
        .get(`/stammdaten/systeme/${randomUUID()}`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(404);
    });

    it('GET Liste enthaelt das angelegte System, gefiltert nach endkundeId', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Beta');
      const { id: systemId } = await legeSystemAn(endkundeId, 'Beta');

      const response = await request(testApp.httpServer)
        .get('/stammdaten/systeme')
        .query({ endkundeId })
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const daten = (response.body as { daten: Array<{ id: string; status: string }> }).daten;
      const gefunden = daten.find((eintrag) => eintrag.id === systemId);
      expect(gefunden).toMatchObject({ id: systemId, status: 'aktiv' });
    });

    it('PATCH aendert die Bezeichnung eines bestehenden Systems', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Gamma');
      const { id: systemId } = await legeSystemAn(endkundeId, 'Gamma');

      const response = await request(testApp.httpServer)
        .patch(`/stammdaten/systeme/${systemId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bezeichnung: 'Testsystem Gamma (umbenannt)' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ bezeichnung: 'Testsystem Gamma (umbenannt)' });
    });

    it('PATCH lehnt ab (400), wenn kein Feld gesetzt ist (minProperties:1)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Delta');
      const { id: systemId } = await legeSystemAn(endkundeId, 'Delta');

      const response = await request(testApp.httpServer)
        .patch(`/stammdaten/systeme/${systemId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({});

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it('PATCH liefert 404 fuer eine unbekannte System-ID', async () => {
      const response = await request(testApp.httpServer)
        .patch(`/stammdaten/systeme/${randomUUID()}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bezeichnung: 'Egal' });

      expect(response.status).toBe(404);
    });

    it('DELETE (stilllegen) setzt den Status auf stillgelegt und ist idempotent (kein Hard-Delete, Linie 3)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Iota');
      const { id: systemId } = await legeSystemAn(endkundeId, 'Iota');

      const erste = await request(testApp.httpServer)
        .delete(`/stammdaten/systeme/${systemId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(erste.status).toBe(200);
      expect((erste.body as { status: string }).status).toBe('stillgelegt');

      const zweite = await request(testApp.httpServer)
        .delete(`/stammdaten/systeme/${systemId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(zweite.status).toBe(200);
      expect((zweite.body as { status: string }).status).toBe('stillgelegt');
    });

    it('DELETE liefert 404 fuer eine unbekannte System-ID', async () => {
      const response = await request(testApp.httpServer)
        .delete(`/stammdaten/systeme/${randomUUID()}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(response.status).toBe(404);
    });
  });

  describe('M1 — Rolle × Route-Matrix (System)', () => {
    it('anonym (kein Token) -> 401 auf GET /stammdaten/systeme', async () => {
      const response = await request(testApp.httpServer).get('/stammdaten/systeme');
      expect(response.status).toBe(401);
    });

    it('anonym (kein Token) -> 401 auf POST /stammdaten/systeme', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/systeme')
        .send({ endkundeId: randomUUID(), bezeichnung: 'X', systemgrenze: 'Y' });
      expect(response.status).toBe(401);
    });

    it('admin -> 403 auf GET /stammdaten/systeme (admin ist KEINE Stammdaten-Rolle, Least-Privilege)', async () => {
      const response = await request(testApp.httpServer)
        .get('/stammdaten/systeme')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(403);
    });

    it('admin -> 403 auf POST /stammdaten/systeme', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/systeme')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ endkundeId: randomUUID(), bezeichnung: 'X', systemgrenze: 'Y' });
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 200 auf GET /stammdaten/systeme (Liste)', async () => {
      const response = await request(testApp.httpServer)
        .get('/stammdaten/systeme')
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(200);
    });

    it('compliance-auditor -> 200 auf GET Detail', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Epsilon');
      const { id: systemId } = await legeSystemAn(endkundeId, 'Epsilon');

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/systeme/${systemId}`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(200);
    });

    it('compliance-auditor -> 403 auf POST /stammdaten/systeme (DS-01)', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/systeme')
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ endkundeId: randomUUID(), bezeichnung: 'X', systemgrenze: 'Y' });
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 403 auf PATCH (Schreib-Route, DS-01)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Zeta');
      const { id: systemId } = await legeSystemAn(endkundeId, 'Zeta');

      const response = await request(testApp.httpServer)
        .patch(`/stammdaten/systeme/${systemId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bezeichnung: 'Sollte nie ankommen' });
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 403 auf DELETE (Stilllegung, DS-01)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Kappa');
      const { id: systemId } = await legeSystemAn(endkundeId, 'Kappa');

      const response = await request(testApp.httpServer)
        .delete(`/stammdaten/systeme/${systemId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(response.status).toBe(403);
    });

    it('admin -> 403 auf DELETE /stammdaten/systeme/{id} (Stilllegung)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Lambda');
      const { id: systemId } = await legeSystemAn(endkundeId, 'Lambda');

      const response = await request(testApp.httpServer)
        .delete(`/stammdaten/systeme/${systemId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(response.status).toBe(403);
    });

    it('anonym (kein Token) -> 401 auf DELETE /stammdaten/systeme/{id}', async () => {
      const response = await request(testApp.httpServer).delete(`/stammdaten/systeme/${randomUUID()}`);
      expect(response.status).toBe(401);
    });

    it('betrieb -> 201 auf POST /stammdaten/systeme (Referenz-Happy-Path)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Eta');

      const response = await request(testApp.httpServer)
        .post('/stammdaten/systeme')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ endkundeId, bezeichnung: 'Testsystem Eta', systemgrenze: 'Gebäude Eta' });
      expect(response.status).toBe(201);
    });

    it('fehlender Idempotency-Key -> 400 auf POST /stammdaten/systeme', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Theta');

      const response = await request(testApp.httpServer)
        .post('/stammdaten/systeme')
        .set('Authorization', `Bearer ${betriebToken}`)
        .send({ endkundeId, bezeichnung: 'Testsystem Theta', systemgrenze: 'Gebäude Theta' });
      expect(response.status).toBe(400);
    });
  });
});
