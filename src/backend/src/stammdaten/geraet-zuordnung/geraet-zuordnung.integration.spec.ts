import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer,
 * `migrations/V0001`-`V0015` angewendet dynamisch ueber `migrate-test-postgres.ts`,
 * KEIN DB-Mock, `.claude/rules/tests.md`) fuer die O4-Geraete-Zuordnungs-
 * Provisionierung (ADR-0005 §26) — `GeraetZuordnungUnterZaehlerController`
 * (POST, Create) + `DeviceGeraetZuordnungController` (PATCH, Deaktivierung)
 * — sowie den Shred-Kopplungs-Fluss (ADR-0005 §26.5, GB-C).
 *
 * Testdaten sind ausschliesslich synthetisch (Test-DevEUIs, `@example.invalid`-
 * Domains, "Testkunde"/"Musterstrasse"-Marker, F6-Bedingung 2/M6).
 */
describe('Geraet-Zuordnung — Integrationstests (ADR-0005 §26, O4-Provisioning)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let betrieb2Token: string;
  let auditorToken: string;
  let adminToken: string;
  let auditClient: Client;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    betrieb2Token = await testApp.signToken('betrieb-freigeber-sub', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-sub', ['compliance-auditor']);
    adminToken = await testApp.signToken('admin-sub', ['admin']);

    auditClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await auditClient.connect();
  }, 120_000);

  afterAll(async () => {
    await auditClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  function idempotencyKey(): string {
    return randomUUID();
  }

  /** Erzeugt eine synthetische, aber FORMAL gueltige DevEUI (16 Hex-Zeichen). */
  function testDevEui(): string {
    return randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  }

  async function legeEndkundeAn(namenSuffix: string): Promise<{ id: string }> {
    const response = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        stammdatenPii: { name: `Testkunde Geraetezuordnung ${namenSuffix}`, anschrift: 'Musterstraße 1, 12345 Musterstadt' },
      });
    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id };
  }

  async function legeZaehlerAn(namenSuffix: string): Promise<{ endkundeId: string; zaehlerId: string }> {
    const { id: endkundeId } = await legeEndkundeAn(namenSuffix);
    const systemResponse = await request(testApp.httpServer)
      .post('/stammdaten/systeme')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ endkundeId, bezeichnung: `Testsystem ${namenSuffix}`, systemgrenze: 'Gebäude Musterhalle' });
    expect(systemResponse.status).toBe(201);
    const systemId = (systemResponse.body as { id: string }).id;

    const zaehlerResponse = await request(testApp.httpServer)
      .post('/stammdaten/zaehler')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ systemId, geraetetyp: 'Testzaehler', energietraeger: 'strom' });
    expect(zaehlerResponse.status).toBe(201);

    return { endkundeId, zaehlerId: (zaehlerResponse.body as { id: string }).id };
  }

  async function legeGeraetZuordnungAn(zaehlerId: string, devEui: string = testDevEui()): Promise<{ id: string }> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ devEui });
    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id };
  }

  describe('POST /stammdaten/zaehler/{zaehlerId}/geraet-zuordnungen — Provisioning-Create', () => {
    it('legt eine Geraete-Zuordnung an (Happy Path), Location + Detail OHNE devEui-Feld', async () => {
      const { zaehlerId } = await legeZaehlerAn('Alpha');
      const devEui = testDevEui();

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ devEui });

      expect(response.status).toBe(201);
      expect(response.headers['location']).toBe(`/stammdaten/geraet-zuordnungen/${(response.body as { id: string }).id}`);
      expect(response.body).toMatchObject({ zaehlerId, status: 'aktiv', pepperVersion: 1, gueltigBis: null });
      expect(response.body).not.toHaveProperty('devEui');
      expect(response.body).not.toHaveProperty('deveuiEnc');
      expect(response.body).not.toHaveProperty('deveuiBlindIndex');
    });

    it('lehnt ab (404), wenn der referenzierte Zaehler nicht existiert', async () => {
      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${randomUUID()}/geraet-zuordnungen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ devEui: testDevEui() });

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it('lehnt ab (400) bei ungueltigem devEui-Format', async () => {
      const { zaehlerId } = await legeZaehlerAn('Beta');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ devEui: 'nicht-hex-xyz' });

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it('lehnt ab (409 Konflikt), wenn fuer denselben Zaehler bereits eine aktive Zuordnung existiert (D-EXCL)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Gamma');
      await legeGeraetZuordnungAn(zaehlerId);

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ devEui: testDevEui() });

      expect(response.status).toBe(409);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it('lehnt ab (409 Konflikt), wenn dieselbe DevEUI bereits aktiv einem ANDEREN Zaehler zugeordnet ist', async () => {
      const { zaehlerId: zaehlerA } = await legeZaehlerAn('DeltaA');
      const { zaehlerId: zaehlerB } = await legeZaehlerAn('DeltaB');
      const devEui = testDevEui();
      await legeGeraetZuordnungAn(zaehlerA, devEui);

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerB}/geraet-zuordnungen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ devEui });

      expect(response.status).toBe(409);
    });

    it('Audit-Zeile "geraet_zuordnung.stammdaten.provisioniert" traegt EXAKT {synthetic,zaehler_id,pepper_version} im Kontext', async () => {
      const { zaehlerId } = await legeZaehlerAn('Epsilon');
      const { id: zuordnungId } = await legeGeraetZuordnungAn(zaehlerId);

      const row = await auditClient.query(
        "SELECT kontext FROM audit.event WHERE event_typ = 'geraet_zuordnung.stammdaten.provisioniert' AND objekt_ref = $1",
        [zuordnungId],
      );
      expect(row.rowCount).toBe(1);
      const kontext = (row.rows[0] as { kontext: Record<string, unknown> }).kontext;
      expect(Object.keys(kontext).sort()).toEqual(['pepper_version', 'synthetic', 'zaehler_id']);
      expect(kontext['zaehler_id']).toBe(zaehlerId);
      expect(kontext['synthetic']).toBe(true);
      expect(kontext['pepper_version']).toBe(1);
    });
  });

  describe('PATCH /stammdaten/geraet-zuordnungen/{geraetZuordnungId} — Deaktivierung', () => {
    it('deaktiviert eine aktive Zuordnung (Happy Path)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Zeta');
      const { id: zuordnungId } = await legeGeraetZuordnungAn(zaehlerId);

      const response = await request(testApp.httpServer)
        .patch(`/stammdaten/geraet-zuordnungen/${zuordnungId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ aktion: 'deaktivieren' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: zuordnungId, status: 'inaktiv' });
      expect((response.body as { gueltigBis: string | null }).gueltigBis).not.toBeNull();
    });

    it('ist idempotent (zweiter Deaktivierungs-Aufruf liefert denselben Erfolg)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Eta');
      const { id: zuordnungId } = await legeGeraetZuordnungAn(zaehlerId);

      const erste = await request(testApp.httpServer)
        .patch(`/stammdaten/geraet-zuordnungen/${zuordnungId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ aktion: 'deaktivieren' });
      expect(erste.status).toBe(200);

      const zweite = await request(testApp.httpServer)
        .patch(`/stammdaten/geraet-zuordnungen/${zuordnungId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ aktion: 'deaktivieren' });
      expect(zweite.status).toBe(200);
      expect((zweite.body as { status: string }).status).toBe('inaktiv');
    });

    it('erlaubt nach Deaktivierung eine NEUE Zuordnung fuer denselben Zaehler (Geraete-Tausch, zwei Aufrufe)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Theta');
      const { id: alteZuordnungId } = await legeGeraetZuordnungAn(zaehlerId);

      await request(testApp.httpServer)
        .patch(`/stammdaten/geraet-zuordnungen/${alteZuordnungId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ aktion: 'deaktivieren' })
        .expect(200);

      const neue = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ devEui: testDevEui() });

      expect(neue.status).toBe(201);
    });

    it('lehnt ab (404) fuer eine unbekannte Zuordnungs-ID', async () => {
      const response = await request(testApp.httpServer)
        .patch(`/stammdaten/geraet-zuordnungen/${randomUUID()}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ aktion: 'deaktivieren' });

      expect(response.status).toBe(404);
    });

    it('Audit-Zeile "geraet_zuordnung.stammdaten.aktualisiert" traegt EXAKT {synthetic,zaehler_id} im Kontext (KEIN pepper_version)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Iota');
      const { id: zuordnungId } = await legeGeraetZuordnungAn(zaehlerId);

      await request(testApp.httpServer)
        .patch(`/stammdaten/geraet-zuordnungen/${zuordnungId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ aktion: 'deaktivieren' })
        .expect(200);

      const row = await auditClient.query(
        "SELECT kontext FROM audit.event WHERE event_typ = 'geraet_zuordnung.stammdaten.aktualisiert' AND objekt_ref = $1",
        [zuordnungId],
      );
      expect(row.rowCount).toBe(1);
      const kontext = (row.rows[0] as { kontext: Record<string, unknown> }).kontext;
      expect(Object.keys(kontext).sort()).toEqual(['synthetic', 'zaehler_id']);
      expect(kontext['zaehler_id']).toBe(zaehlerId);
    });
  });

  describe('Shred-Kopplung (ADR-0005 §26.5, GB-C) — Endkunde-Shred nullt die Geraete-Zuordnung', () => {
    it(
      'Endkunde-Shred (Vier-Augen freigeben) schreddert AUCH die Geraete-Zuordnung seines Zaehlers: ' +
        'status=geschreddert, gueltig_bis gesetzt, deveui_blind_index=NULL; Audit-Zeile mit korrektem Kontext',
      async () => {
        const { endkundeId, zaehlerId } = await legeZaehlerAn('Kappa');
        const { id: zuordnungId } = await legeGeraetZuordnungAn(zaehlerId);

        const beantragen = await request(testApp.httpServer)
          .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege`)
          .set('Authorization', `Bearer ${betriebToken}`)
          .set('Idempotency-Key', idempotencyKey())
          .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' });
        expect(beantragen.status).toBe(201);
        const antragId = (beantragen.body as { id: string }).id;

        const freigeben = await request(testApp.httpServer)
          .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege/${antragId}/freigeben`)
          .set('Authorization', `Bearer ${betrieb2Token}`)
          .set('Idempotency-Key', idempotencyKey())
          .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN' });
        expect(freigeben.status).toBe(200);

        const zuordnungRow = await auditClient.query(
          'SELECT status, gueltig_bis, deveui_blind_index FROM device.geraet_zuordnung WHERE id = $1',
          [zuordnungId],
        );
        expect(zuordnungRow.rowCount).toBe(1);
        const zuordnung = zuordnungRow.rows[0] as { status: string; gueltig_bis: string | null; deveui_blind_index: Buffer | null };
        expect(zuordnung.status).toBe('geschreddert');
        expect(zuordnung.gueltig_bis).not.toBeNull();
        expect(zuordnung.deveui_blind_index).toBeNull();

        const auditRow = await auditClient.query(
          "SELECT kontext FROM audit.event WHERE event_typ = 'geraet_zuordnung.stammdaten.geschreddert' AND objekt_ref = $1",
          [zuordnungId],
        );
        expect(auditRow.rowCount).toBe(1);
        const kontext = (auditRow.rows[0] as { kontext: Record<string, unknown> }).kontext;
        expect(Object.keys(kontext).sort()).toEqual(['antrag_id', 'synthetic', 'zaehler_id']);
        expect(kontext['zaehler_id']).toBe(zaehlerId);
        expect(kontext['antrag_id']).toBe(antragId);
        expect(kontext['synthetic']).toBe(true);
      },
    );

    it('Endkunde ohne Geraete-Zuordnung: Shred laeuft weiterhin fehlerfrei durch (leere Zaehler-/Zuordnungs-Menge)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('LambdaOhneZaehler');

      const beantragen = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' });
      expect(beantragen.status).toBe(201);
      const antragId = (beantragen.body as { id: string }).id;

      const freigeben = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege/${antragId}/freigeben`)
        .set('Authorization', `Bearer ${betrieb2Token}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN' });

      expect(freigeben.status).toBe(200);
      expect((freigeben.body as { shredding: { geschreddert: boolean } }).shredding.geschreddert).toBe(true);
    });
  });

  describe('M1 — Rolle × Route-Matrix (Geraete-Zuordnung)', () => {
    it('anonym (kein Token) -> 401 auf POST create', async () => {
      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${randomUUID()}/geraet-zuordnungen`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ devEui: testDevEui() });
      expect(response.status).toBe(401);
    });

    it('compliance-auditor -> 403 auf POST create (DS-01, auditor bleibt strikt lesend)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Mu');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ devEui: testDevEui() });
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 403 auf PATCH aendern', async () => {
      const { zaehlerId } = await legeZaehlerAn('Nu');
      const { id: zuordnungId } = await legeGeraetZuordnungAn(zaehlerId);

      const response = await request(testApp.httpServer)
        .patch(`/stammdaten/geraet-zuordnungen/${zuordnungId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ aktion: 'deaktivieren' });
      expect(response.status).toBe(403);
    });

    it('admin -> 403 auf POST create (admin ist KEINE Stammdaten-Rolle)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Xi');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ devEui: testDevEui() });
      expect(response.status).toBe(403);
    });

    it('betrieb -> 201 auf POST create (Referenz-Happy-Path)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Omikron');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ devEui: testDevEui() });
      expect(response.status).toBe(201);
    });

    it('fehlender Idempotency-Key -> 400 auf POST create', async () => {
      const { zaehlerId } = await legeZaehlerAn('Pi');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .send({ devEui: testDevEui() });
      expect(response.status).toBe(400);
    });
  });
});
