import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer, KEIN
 * DB-Mock, `.claude/rules/tests.md`) für den `ZaehlerController`
 * (`/stammdaten/zaehler`) — schließt die Merge-Blocker-Lücke aus dem
 * Phase-4-Review. Muster 1:1 aus `stammdaten.integration.spec.ts`
 * übernommen. Deckt zusätzlich die idempotente Stilllegung ab (Linie 3,
 * kein Hard-Delete).
 */
describe('ZaehlerController — Integrationstests (ADR-0008 Teil B, Phase 4)', () => {
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
        stammdatenPii: { name: `Testkunde Musterfirma ${namenSuffix}`, anschrift: 'Musterstraße 1, 12345 Musterstadt' },
      });
    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id };
  }

  async function legeSystemAn(endkundeId: string, suffix: string): Promise<{ id: string }> {
    const response = await request(testApp.httpServer)
      .post('/stammdaten/systeme')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ endkundeId, bezeichnung: `Testsystem ${suffix}`, systemgrenze: 'Gebäude Musterhalle' });
    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id };
  }

  async function legeZaehlerAn(systemId: string): Promise<{ id: string }> {
    const response = await request(testApp.httpServer)
      .post('/stammdaten/zaehler')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ systemId, geraetetyp: 'Testzaehler Modell X', energietraeger: 'strom' });
    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id };
  }

  async function legeVollstaendigenPfadAn(namenSuffix: string): Promise<{ systemId: string; zaehlerId: string }> {
    const { id: endkundeId } = await legeEndkundeAn(namenSuffix);
    const { id: systemId } = await legeSystemAn(endkundeId, namenSuffix);
    const { id: zaehlerId } = await legeZaehlerAn(systemId);
    return { systemId, zaehlerId };
  }

  describe('Zaehler — Anlegen/Lesen/Aendern/Stilllegen', () => {
    it('POST legt einen Zaehler an, wenn das System existiert (Happy Path)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Alpha');
      const { id: systemId } = await legeSystemAn(endkundeId, 'Alpha');

      const response = await request(testApp.httpServer)
        .post('/stammdaten/zaehler')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ systemId, geraetetyp: 'Testzaehler Modell X', energietraeger: 'strom' });

      expect(response.status).toBe(201);
      expect(response.headers['location']).toBe(`/stammdaten/zaehler/${(response.body as { id: string }).id}`);
      expect(response.body).toMatchObject({ systemId, energietraeger: 'strom', status: 'aktiv' });
    });

    it('POST lehnt ab (404), wenn das referenzierte System nicht existiert', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/zaehler')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ systemId: randomUUID(), geraetetyp: 'Testzaehler', energietraeger: 'strom' });

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it('GET Detail liefert 404 fuer eine unbekannte Zaehler-ID', async () => {
      const response = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${randomUUID()}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(response.status).toBe(404);
    });

    it('GET Liste enthaelt den angelegten Zaehler, gefiltert nach systemId', async () => {
      const { systemId, zaehlerId } = await legeVollstaendigenPfadAn('Beta');

      const response = await request(testApp.httpServer)
        .get('/stammdaten/zaehler')
        .query({ systemId })
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const daten = (response.body as { daten: Array<{ id: string }> }).daten;
      expect(daten.some((eintrag) => eintrag.id === zaehlerId)).toBe(true);
    });

    it('GET Liste sagt je Zaehler, ob ein Geraet haengt und wann zuletzt etwas ankam', async () => {
      // Die zwei Fragen, mit denen das Anschliessen einer Anlage anfaengt.
      // Sie standen bisher NUR auf der Detailseite — um unter zwoelf Zaehlern
      // den stummen zu finden, musste man zwoelfmal klicken.
      //
      // `angebunden` sagt DASS, nicht welches Geraet: DevEUI und Blind-Index
      // verlassen den Ingest-Pfad nicht (ADR-0005 §26.6). Genau das prueft
      // die zweite Erwartung mit.
      const { systemId, zaehlerId } = await legeVollstaendigenPfadAn('Empfang');

      const ohneGeraet = await request(testApp.httpServer)
        .get('/stammdaten/zaehler')
        .query({ systemId })
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(ohneGeraet.status).toBe(200);
      const vorher = (ohneGeraet.body as { daten: Array<{ id: string; angebunden: boolean; letzteUebertragung: string | null }> }).daten.find(
        (eintrag) => eintrag.id === zaehlerId,
      );
      expect(vorher).toMatchObject({ angebunden: false, letzteUebertragung: null });

      const angebunden = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ devEui: 'AA-AA-AA-AA-AA-AA-AA-01' });
      expect(angebunden.status).toBe(201);

      const nachher = await request(testApp.httpServer)
        .get('/stammdaten/zaehler')
        .query({ systemId })
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(nachher.status).toBe(200);
      const zeile = (nachher.body as { daten: Array<{ id: string; angebunden: boolean; letzteUebertragung: string | null }> }).daten.find(
        (eintrag) => eintrag.id === zaehlerId,
      );
      // Angebunden ja — aber es kam noch nichts an. Genau dieser Zustand
      // („haengt dran, sendet aber nicht") war vorher nirgends ablesbar.
      expect(zeile).toMatchObject({ angebunden: true, letzteUebertragung: null });
      expect(JSON.stringify(zeile)).not.toContain('AA-AA-AA-AA-AA-AA-AA-01');
      expect(JSON.stringify(zeile)).not.toContain('blindIndex');
    });

    it('PATCH aendert geraetetyp eines bestehenden Zaehlers', async () => {
      const { zaehlerId } = await legeVollstaendigenPfadAn('Gamma');

      const response = await request(testApp.httpServer)
        .patch(`/stammdaten/zaehler/${zaehlerId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ geraetetyp: 'Testzaehler Modell Y' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ geraetetyp: 'Testzaehler Modell Y' });
    });

    it('PATCH lehnt ab (400), wenn geraetetyp nicht gesetzt ist (minProperties:1)', async () => {
      const { zaehlerId } = await legeVollstaendigenPfadAn('Delta');

      const response = await request(testApp.httpServer)
        .patch(`/stammdaten/zaehler/${zaehlerId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({});

      expect(response.status).toBe(400);
    });

    it('DELETE (stilllegen) setzt den Status auf stillgelegt und ist idempotent (kein Hard-Delete, Linie 3)', async () => {
      const { zaehlerId } = await legeVollstaendigenPfadAn('Epsilon');

      const erste = await request(testApp.httpServer)
        .delete(`/stammdaten/zaehler/${zaehlerId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(erste.status).toBe(200);
      expect((erste.body as { status: string }).status).toBe('stillgelegt');

      const zweite = await request(testApp.httpServer)
        .delete(`/stammdaten/zaehler/${zaehlerId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(zweite.status).toBe(200);
      expect((zweite.body as { status: string }).status).toBe('stillgelegt');
    });

    it('DELETE liefert 404 fuer eine unbekannte Zaehler-ID', async () => {
      const response = await request(testApp.httpServer)
        .delete(`/stammdaten/zaehler/${randomUUID()}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(response.status).toBe(404);
    });
  });

  describe('M1 — Rolle × Route-Matrix (Zaehler)', () => {
    it('anonym (kein Token) -> 401 auf GET /stammdaten/zaehler', async () => {
      const response = await request(testApp.httpServer).get('/stammdaten/zaehler');
      expect(response.status).toBe(401);
    });

    it('admin -> 403 auf GET /stammdaten/zaehler', async () => {
      const response = await request(testApp.httpServer)
        .get('/stammdaten/zaehler')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(403);
    });

    it('admin -> 403 auf POST /stammdaten/zaehler', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/zaehler')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ systemId: randomUUID(), geraetetyp: 'X', energietraeger: 'strom' });
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 200 auf GET /stammdaten/zaehler (Liste)', async () => {
      const response = await request(testApp.httpServer)
        .get('/stammdaten/zaehler')
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(200);
    });

    it('compliance-auditor -> 403 auf POST /stammdaten/zaehler (DS-01)', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/zaehler')
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ systemId: randomUUID(), geraetetyp: 'X', energietraeger: 'strom' });
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 403 auf PATCH', async () => {
      const { zaehlerId } = await legeVollstaendigenPfadAn('Zeta');

      const response = await request(testApp.httpServer)
        .patch(`/stammdaten/zaehler/${zaehlerId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ geraetetyp: 'Sollte nie ankommen' });
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 403 auf DELETE (Stilllegung)', async () => {
      const { zaehlerId } = await legeVollstaendigenPfadAn('Eta');

      const response = await request(testApp.httpServer)
        .delete(`/stammdaten/zaehler/${zaehlerId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(response.status).toBe(403);
    });

    it('betrieb -> 201 auf POST /stammdaten/zaehler (Referenz-Happy-Path)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Theta');
      const { id: systemId } = await legeSystemAn(endkundeId, 'Theta');

      const response = await request(testApp.httpServer)
        .post('/stammdaten/zaehler')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ systemId, geraetetyp: 'Testzaehler Theta', energietraeger: 'strom' });
      expect(response.status).toBe(201);
    });

    it('fehlender Idempotency-Key -> 400 auf POST /stammdaten/zaehler', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Iota');
      const { id: systemId } = await legeSystemAn(endkundeId, 'Iota');

      const response = await request(testApp.httpServer)
        .post('/stammdaten/zaehler')
        .set('Authorization', `Bearer ${betriebToken}`)
        .send({ systemId, geraetetyp: 'Testzaehler Iota', energietraeger: 'strom' });
      expect(response.status).toBe(400);
    });
  });
});
