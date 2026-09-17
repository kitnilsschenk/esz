import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer, KEIN
 * DB-Mock, `.claude/rules/tests.md`) für den `AnschlussnutzerController`
 * (`/stammdaten/anschlussnutzer`) — PRIORITÄT im Merge-Blocker-Review, weil
 * `AnschlussnutzerService` EXAKT das Endkunde-PII-Muster fährt (NESTED-Tx
 * über identity+energy, KMS-Unwrap, `PiiProjektionsPolicy`-Maskierung) und
 * bislang KOMPLETT ungetestet war. Muster 1:1 aus
 * `stammdaten.integration.spec.ts` übernommen (Endkunde-PII-Block).
 */
describe('AnschlussnutzerController — Integrationstests (ADR-0008 Teil B, Phase 4)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let auditorToken: string;
  let adminToken: string;
  /** Verifikations-Client gegen `audit.event` (echte, committete Zeile — kein Mock). */
  let auditClient: Client;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
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

  async function legeAnschlussnutzerAn(
    endkundeId: string,
    namenSuffix: string,
  ): Promise<{ id: string }> {
    const response = await request(testApp.httpServer)
      .post('/stammdaten/anschlussnutzer')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        endkundeId,
        stammdatenPii: { name: `Testnutzer Musterperson ${namenSuffix}`, kontakt: 'nutzer@example.invalid' },
      });
    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id };
  }

  /** Aktions-Route mit Pflicht-Grund (ADR-0007 A11.1/A11.6). */
  // `neuerhebungFortsetzen` (Auflage C-8) — s. Kommentar in
  // stammdaten.integration.spec.ts.
  async function sperre(anschlussnutzerId: string, grund: string, neuerhebungFortsetzen = true) {
    return request(testApp.httpServer)
      .post(`/stammdaten/anschlussnutzer/${anschlussnutzerId}/sperren`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(
        grund === 'art18_1b_unrechtmaessig' || grund === 'art18_1d_widerspruch'
          ? { grund, neuerhebungFortsetzen }
          : { grund },
      );
  }

  describe('Art.-18-Sperre (ADR-0007 A11.6) — vorher gab es UEBERHAUPT keinen Schreibpfad', () => {
    it('sperrt mit Pflicht-Grund und liefert Grund + Zeitpunkt zurueck; zweiter Aufruf mit gleichem Grund ist idempotent', async () => {
      const { id: endkundeId } = await legeEndkundeAn('SperreA');
      const { id } = await legeAnschlussnutzerAn(endkundeId, 'SperreA');

      const erste = await sperre(id, 'art18_1a_richtigkeit');
      expect(erste.status).toBe(200);
      const ersterBody = erste.body as { verarbeitungsStatus: string; einschraenkungGrundCode: string; gesperrtSeit: string };
      expect(ersterBody.verarbeitungsStatus).toBe('gesperrt');
      expect(ersterBody.einschraenkungGrundCode).toBe('art18_1a_richtigkeit');
      expect(ersterBody.gesperrtSeit).not.toBeNull();

      const zweite = await sperre(id, 'art18_1a_richtigkeit');
      expect(zweite.status).toBe(200);
      expect((zweite.body as { gesperrtSeit: string }).gesperrtSeit).toBe(ersterBody.gesperrtSeit);
    });

    it('lehnt einen ABWEICHENDEN Grund mit 409 ab und laesst den bestehenden unangetastet (A11.2)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('SperreB');
      const { id } = await legeAnschlussnutzerAn(endkundeId, 'SperreB');

      expect((await sperre(id, 'art18_1a_richtigkeit')).status).toBe(200);
      expect((await sperre(id, 'art18_1d_widerspruch')).status).toBe(409);

      const detail = await request(testApp.httpServer)
        .get(`/stammdaten/anschlussnutzer/${id}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect((detail.body as { einschraenkungGrundCode: string }).einschraenkungGrundCode).toBe('art18_1a_richtigkeit');
    });

    it('weist einen fehlenden oder unbekannten Grund an der DTO-Grenze mit 400 ab (kein Auffangcode, A11.1)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('SperreC');
      const { id } = await legeAnschlussnutzerAn(endkundeId, 'SperreC');

      const ohneGrund = await request(testApp.httpServer)
        .post(`/stammdaten/anschlussnutzer/${id}/sperren`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({});
      expect(ohneGrund.status).toBe(400);
      expect((await sperre(id, 'sonstiges')).status).toBe(400);
    });

    it('ist unabhaengig von der Endkunden-Sperre — genau das sichert betroffenenrechte.md zu (A11.6)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('SperreD');
      const { id } = await legeAnschlussnutzerAn(endkundeId, 'SperreD');

      expect((await sperre(id, 'art18_1d_widerspruch')).status).toBe(200);

      // Der Endkunde bleibt unberuehrt: die beiden sind eigenstaendige
      // betroffene Personen, ihre Einschraenkungen wirken getrennt (FJ-11a/b/c
      // vs. FJ-07a/b/c im Nachweis).
      const endkunde = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect((endkunde.body as { verarbeitungsStatus: string }).verarbeitungsStatus).toBe('aktiv');
      expect((endkunde.body as { einschraenkungGrundCode: string | null }).einschraenkungGrundCode).toBeNull();
    });

    // A11.5-Positivliste, analog zum Endkunden-Test. Ohne V0033 gaebe es den
    // Event-Typ gar nicht und der Append liefe gegen den FK; ohne die
    // Kontext-Whitelist gegen den fail-closed `audit.event_seal()`-Trigger.
    it('schreibt den Grund in die ECHTE Audit-Zeile — und nur ihn (A11.5)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('SperreE');
      const { id } = await legeAnschlussnutzerAn(endkundeId, 'SperreE');

      expect((await sperre(id, 'art18_1b_unrechtmaessig')).status).toBe(200);

      const auditRow = await auditClient.query(
        "SELECT kontext FROM audit.event WHERE event_typ = 'anschlussnutzer.stammdaten.gesperrt' AND objekt_ref = $1",
        [id],
      );
      expect(auditRow.rowCount).toBe(1);
      const { kontext } = auditRow.rows[0] as { kontext: Record<string, unknown> };
      expect(kontext['einschraenkung_grund_code']).toBe('art18_1b_unrechtmaessig');
      expect(kontext['synthetic']).toBe(true);
      // Seit V0089 (Auflage C-8) traegt die Zeile bei lit. b zusaetzlich die
      // Entscheidung ueber die weitere Erhebung. Die Aussage dieses Tests
      // aendert sich dadurch NICHT -- er prueft weiterhin, dass genau die
      // whitelisted Schluessel ankommen und kein Antragsteller, kein
      // Freitext, kein Belegverweis mitlaeuft. Die Positivliste ist
      // gewachsen, nicht aufgeweicht.
      expect(kontext['neuerhebung_fortsetzen']).toBe('true');
      expect(Object.keys(kontext).sort()).toEqual([
        'einschraenkung_grund_code',
        'neuerhebung_fortsetzen',
        'synthetic',
      ]);
    });

    async function unterrichte(id: string, kanal: string) {
      return request(testApp.httpServer)
        .post(`/stammdaten/anschlussnutzer/${id}/einschraenkung-unterrichtung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ kanal });
    }

    async function entsperre(id: string) {
      return request(testApp.httpServer)
        .post(`/stammdaten/anschlussnutzer/${id}/entsperren`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey());
    }

    // Art. 18 Abs. 3 gilt fuer den Anschlussnutzer genauso — er ist eine
    // eigene betroffene Person, sein Vorgang laeuft unabhaengig.
    it('lehnt das Entsperren ohne dokumentierte Unterrichtung ab und hebt danach auf', async () => {
      const { id: endkundeId } = await legeEndkundeAn('EntsperrA');
      const { id } = await legeAnschlussnutzerAn(endkundeId, 'EntsperrA');

      expect((await sperre(id, 'art18_1a_richtigkeit')).status).toBe(200);
      expect((await entsperre(id)).status).toBe(409);

      expect((await unterrichte(id, 'elektronisch')).status).toBe(200);

      const aufgehoben = await entsperre(id);
      expect(aufgehoben.status).toBe(200);
      const body = aufgehoben.body as {
        verarbeitungsStatus: string;
        einschraenkungGrundCode: string | null;
        gesperrtSeit: string | null;
      };
      expect(body.verarbeitungsStatus).toBe('aktiv');
      expect(body.einschraenkungGrundCode).toBeNull();
      expect(body.gesperrtSeit).toBeNull();
    });

    it('protokolliert die Aufhebung mit dem Grund des aufgehobenen Vorgangs (V0036)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('EntsperrB');
      const { id } = await legeAnschlussnutzerAn(endkundeId, 'EntsperrB');

      expect((await sperre(id, 'art18_1d_widerspruch')).status).toBe(200);
      expect((await unterrichte(id, 'postalisch')).status).toBe(200);
      expect((await entsperre(id)).status).toBe(200);

      const zeile = await auditClient.query(
        "SELECT kontext FROM audit.event WHERE event_typ = 'anschlussnutzer.stammdaten.entsperrt' AND objekt_ref = $1",
        [id],
      );
      expect(zeile.rowCount).toBe(1);
      const kontext = (zeile.rows[0] as { kontext: Record<string, unknown> }).kontext;
      expect(kontext['einschraenkung_grund_code']).toBe('art18_1d_widerspruch');
      expect(Object.keys(kontext).sort()).toEqual(['einschraenkung_grund_code', 'synthetic']);
    });

    it('bleibt fuer compliance-auditor gesperrt (DS-01, strikt lesend)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('SperreF');
      const { id } = await legeAnschlussnutzerAn(endkundeId, 'SperreF');

      const antwort = await request(testApp.httpServer)
        .post(`/stammdaten/anschlussnutzer/${id}/sperren`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ grund: 'art18_1a_richtigkeit' });
      expect(antwort.status).toBe(403);
    });
  });

  describe('Anschlussnutzer — NESTED-Tx-Create + PII-Projektion (analog Endkunde D6/D7/D8)', () => {
    it('POST legt einen Anschlussnutzer an; die Response enthaelt die PII im Klartext (betrieb erreicht die Route)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Alpha');

      const response = await request(testApp.httpServer)
        .post('/stammdaten/anschlussnutzer')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          endkundeId,
          stammdatenPii: { name: 'Testnutzer Musterperson Alpha', kontakt: 'nutzer.alpha@example.invalid' },
        });

      expect(response.status).toBe(201);
      expect(response.headers['location']).toBe(`/stammdaten/anschlussnutzer/${(response.body as { id: string }).id}`);
      expect(response.body).toMatchObject({
        endkundeId,
        verarbeitungsStatus: 'aktiv',
        stammdatenPii: { name: 'Testnutzer Musterperson Alpha', kontakt: 'nutzer.alpha@example.invalid' },
      });
    });

    it('POST lehnt ab (404), wenn der referenzierte Endkunde nicht existiert', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/anschlussnutzer')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ endkundeId: randomUUID(), stammdatenPii: { name: 'Testnutzer Waise' } });

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it('GET Detail: betrieb sieht die entschluesselte PII, compliance-auditor NIE (D2/D6-Aufloesung)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Beta');
      const { id } = await legeAnschlussnutzerAn(endkundeId, 'Beta');

      const alsBetrieb = await request(testApp.httpServer)
        .get(`/stammdaten/anschlussnutzer/${id}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(alsBetrieb.status).toBe(200);
      expect((alsBetrieb.body as { stammdatenPii: { name: string } | null }).stammdatenPii).toEqual({
        name: 'Testnutzer Musterperson Beta',
        kontakt: 'nutzer@example.invalid',
      });

      const alsAuditor = await request(testApp.httpServer)
        .get(`/stammdaten/anschlussnutzer/${id}`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(alsAuditor.status).toBe(200);
      expect((alsAuditor.body as { stammdatenPii: unknown }).stammdatenPii).toBeNull();
    });

    it('GET Detail liefert 404 fuer eine unbekannte Anschlussnutzer-ID', async () => {
      const response = await request(testApp.httpServer)
        .get(`/stammdaten/anschlussnutzer/${randomUUID()}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(response.status).toBe(404);
    });

    it('GET Liste enthaelt KEIN PII-Feld im Klartext (Linie 2, schema-erzwungen — PII-Leak-Scan, M4/M6)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Gamma');
      await legeAnschlussnutzerAn(endkundeId, 'Gamma');

      const response = await request(testApp.httpServer)
        .get('/stammdaten/anschlussnutzer')
        .query({ endkundeId })
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('Testnutzer');
      expect(serialized).not.toContain('example.invalid');
      expect(serialized).not.toContain('"name"');
      expect(serialized).not.toContain('"kontakt"');
    });

    it('GET Liste enthaelt den angelegten Anschlussnutzer, gefiltert nach endkundeId', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Delta');
      const { id: anschlussnutzerId } = await legeAnschlussnutzerAn(endkundeId, 'Delta');

      const response = await request(testApp.httpServer)
        .get('/stammdaten/anschlussnutzer')
        .query({ endkundeId })
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const daten = (response.body as { daten: Array<{ id: string; endkundeId: string }> }).daten;
      expect(daten.some((eintrag) => eintrag.id === anschlussnutzerId && eintrag.endkundeId === endkundeId)).toBe(true);
    });
  });

  describe('M1 — Rolle × Route-Matrix (Anschlussnutzer)', () => {
    it('anonym (kein Token) -> 401 auf GET /stammdaten/anschlussnutzer', async () => {
      const response = await request(testApp.httpServer).get('/stammdaten/anschlussnutzer');
      expect(response.status).toBe(401);
    });

    it('anonym (kein Token) -> 401 auf POST /stammdaten/anschlussnutzer', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/anschlussnutzer')
        .send({ endkundeId: randomUUID(), stammdatenPii: { name: 'X' } });
      expect(response.status).toBe(401);
    });

    it('admin -> 403 auf GET /stammdaten/anschlussnutzer (admin ist KEINE Stammdaten-Rolle)', async () => {
      const response = await request(testApp.httpServer)
        .get('/stammdaten/anschlussnutzer')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(403);
    });

    it('admin -> 403 auf POST /stammdaten/anschlussnutzer', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/anschlussnutzer')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ endkundeId: randomUUID(), stammdatenPii: { name: 'X' } });
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 200 auf GET /stammdaten/anschlussnutzer (Liste)', async () => {
      const response = await request(testApp.httpServer)
        .get('/stammdaten/anschlussnutzer')
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(200);
    });

    it('compliance-auditor -> 403 auf POST /stammdaten/anschlussnutzer (DS-01)', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/anschlussnutzer')
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ endkundeId: randomUUID(), stammdatenPii: { name: 'Sollte nie ankommen' } });
      expect(response.status).toBe(403);
    });

    it('betrieb -> 201 auf POST /stammdaten/anschlussnutzer (Referenz-Happy-Path)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Epsilon');

      const response = await request(testApp.httpServer)
        .post('/stammdaten/anschlussnutzer')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ endkundeId, stammdatenPii: { name: 'Testnutzer Musterperson Epsilon' } });
      expect(response.status).toBe(201);
    });

    it('fehlender Idempotency-Key -> 400 auf POST /stammdaten/anschlussnutzer', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Zeta');

      const response = await request(testApp.httpServer)
        .post('/stammdaten/anschlussnutzer')
        .set('Authorization', `Bearer ${betriebToken}`)
        .send({ endkundeId, stammdatenPii: { name: 'Testnutzer Musterperson Zeta' } });
      expect(response.status).toBe(400);
    });
  });
});
