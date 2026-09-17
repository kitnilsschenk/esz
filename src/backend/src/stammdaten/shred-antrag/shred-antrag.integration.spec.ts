import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer,
 * `migrations/V0001`-`V0009` angewendet, KEIN DB-Mock, `.claude/rules/
 * tests.md`) für den Vier-Augen-Krypto-Shredding-Workflow (ADR-0009,
 * Folgeauftrag ADR-0008 §29(C4)).
 *
 * Testdaten sind ausschließlich synthetisch (`@example.invalid`-Domains,
 * "Testkunde"/"Musterstraße"-Marker, F6-Bedingung 2/M6).
 */
describe('ShredAntragController — Integrationstests (ADR-0009, Vier-Augen-Krypto-Shredding)', () => {
  let testApp: StammdatenTestApp;
  // ZWEI betrieb-Personen mit unterschiedlichem `sub` — Vier-Augen-Fundament
  // (Freigeber-Modell, ADR-0009 §2: erzwungen wird AUSSCHLIESSLICH
  // Freigeber-sub != Antragsteller-sub, beide Personen halten dieselbe Rolle).
  let betriebToken: string;
  let betrieb2Token: string;
  let auditorToken: string;
  let adminToken: string;
  let auditClient: Client;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-antragsteller-sub', ['betrieb']);
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

  async function legeEndkundeAn(namenSuffix: string): Promise<{ id: string }> {
    const response = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        stammdatenPii: {
          name: `Testkunde Shredworkflow ${namenSuffix}`,
          anschrift: 'Musterstraße 1, 12345 Musterstadt',
        },
      });
    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id };
  }

  async function beantrageShred(endkundeId: string, token: string = betriebToken): Promise<{ id: string }> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' });
    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id };
  }

  describe('Voller Fluss: beantragen -> freigeben -> ausgefuehrt', () => {
    it('POST beantragen legt einen Antrag im Status "beantragt" an', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Alpha');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' });

      expect(response.status).toBe(201);
      expect(response.headers['location']).toBe(
        `/stammdaten/endkunden/${endkundeId}/shred-antraege/${(response.body as { id: string }).id}`,
      );
      expect(response.body).toMatchObject({
        endkundeId,
        status: 'beantragt',
        grund: 'betroffenenantrag_art17',
        beantragtVonSub: 'betrieb-antragsteller-sub',
        freigeberSub: null,
      });
    });

    it(
      'POST freigeben durch eine ZWEITE Person schreddert den Endkunden atomar (Antrag -> ausgefuehrt, PII maskiert danach, ' +
        'geschreddert-Event traegt kontext.antrag_id, Audit-Reihenfolge shred_freigegeben < geschreddert)',
      async () => {
        const { id: endkundeId } = await legeEndkundeAn('Beta');
        const { id: antragId } = await beantrageShred(endkundeId);

        const response = await request(testApp.httpServer)
          .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege/${antragId}/freigeben`)
          .set('Authorization', `Bearer ${betrieb2Token}`)
          .set('Idempotency-Key', idempotencyKey())
          .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN' });

        expect(response.status).toBe(200);
        const body = response.body as { antrag: { status: string; freigeberSub: string }; shredding: { geschreddert: boolean } };
        expect(body.antrag.status).toBe('ausgefuehrt');
        expect(body.antrag.freigeberSub).toBe('betrieb-freigeber-sub');
        expect(body.shredding.geschreddert).toBe(true);

        // PII danach maskiert (Chiffrat unwiederbringlich, ADR-0008 §19).
        const detail = await request(testApp.httpServer)
          .get(`/stammdaten/endkunden/${endkundeId}`)
          .set('Authorization', `Bearer ${betriebToken}`);
        expect((detail.body as { stammdatenPii: unknown; verarbeitungsStatus: string }).stammdatenPii).toBeNull();
        expect((detail.body as { verarbeitungsStatus: string }).verarbeitungsStatus).toBe('geloescht');

        // geschreddert-Event traegt kontext.antrag_id (ADR-0009 §2.3, V0009-SCD2-Nachtrag).
        const geschreddertRow = await auditClient.query(
          "SELECT kontext, seq, tag_utc, lane FROM audit.event WHERE event_typ = 'endkunde.stammdaten.geschreddert' AND objekt_ref = $1",
          [endkundeId],
        );
        expect(geschreddertRow.rowCount).toBe(1);
        const geschreddert = geschreddertRow.rows[0] as { kontext: Record<string, unknown>; seq: string; tag_utc: string; lane: number };
        expect(geschreddert.kontext['antrag_id']).toBe(antragId);
        expect(geschreddert.kontext['synthetic']).toBe(true);

        // shred_freigegeben MUSS eine NIEDRIGERE seq haben (Finding P2, logische
        // Reihenfolge Freigabe VOR Ausfuehrung) — beide Ereignisse liegen in
        // derselben Lane/demselben Tag (eine Tx = eine Lane, ADR-0003 §14.2).
        const freigegebenRow = await auditClient.query(
          "SELECT kontext, seq FROM audit.event WHERE event_typ = 'endkunde.stammdaten.shred_freigegeben' AND objekt_ref = $1",
          [endkundeId],
        );
        expect(freigegebenRow.rowCount).toBe(1);
        const freigegeben = freigegebenRow.rows[0] as { kontext: Record<string, unknown>; seq: string };
        expect(freigegeben.kontext['antrag_id']).toBe(antragId);
        expect(BigInt(freigegeben.seq)).toBeLessThan(BigInt(geschreddert.seq));

        // Ketten-Integritaet (audit.pruefe_kette, V0003) bleibt intakt.
        const kettenPruefung = await auditClient.query(
          'SELECT status FROM audit.pruefe_kette($1::date, $1::date) WHERE lane = $2',
          [geschreddert.tag_utc, geschreddert.lane],
        );
        expect(kettenPruefung.rowCount).toBeGreaterThanOrEqual(1);
        for (const row of kettenPruefung.rows as Array<{ status: string }>) {
          expect(row.status).toBe('ok');
        }
      },
    );

    // REGRESSION (G-1, gefunden im A11.13-Abgleich): ein Krypto-Shred auf ein
    // aktuell GESPERRTES Subjekt scheiterte am Kohaerenz-CHECK
    // `ck_endkunde_einschraenkung_kohaerenz` (V0024). Der verlangt: gesetzter
    // Grund => `verarbeitungs_status='gesperrt'`. `markGeloescht()` setzte aber
    // nur den Status auf 'geloescht' und liess Grund/`gesperrt_seit` stehen —
    // CHECK-Verletzung, unbehandelter 500.
    //
    // Der Fall war VOR der A11-Umsetzung unerreichbar, weil die Spalten immer
    // NULL waren; er ist damit eine Regression dieses Auftrags, kein
    // Altbestand. Fachlich ist Art. 17 nach Art. 18 der Normalfall: wer die
    // Einschraenkung erwirkt hat, verlangt danach oft die Loeschung.
    it('Krypto-Shred auf einen GESPERRTEN Endkunden gelingt und loescht die Art.-18-Spuren mit (G-1)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('GesperrtDannGeschreddert');

      const gesperrt = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/sperren`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        // `neuerhebungFortsetzen` (Auflage C-8) — bei lit. b Pflichtangabe.
        .send({ grund: 'art18_1b_unrechtmaessig', neuerhebungFortsetzen: true });
      expect(gesperrt.status).toBe(200);

      const { id: antragId } = await beantrageShred(endkundeId);
      const freigabe = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege/${antragId}/freigeben`)
        .set('Authorization', `Bearer ${betrieb2Token}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN' });

      expect(freigabe.status).toBe(200);
      expect((freigabe.body as { shredding: { geschreddert: boolean } }).shredding.geschreddert).toBe(true);

      const detail = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      const body = detail.body as {
        verarbeitungsStatus: string;
        einschraenkungGrundCode: string | null;
        gesperrtSeit: string | null;
      };
      expect(body.verarbeitungsStatus).toBe('geloescht');
      // Art. 17 hebt die Einschraenkung nicht auf, er ueberholt sie: nach
      // vollzogener Loeschung gibt es nichts mehr einzuschraenken. Die Spuren
      // muessen daher mit weichen — der CHECK erzwingt es ohnehin.
      expect(body.einschraenkungGrundCode).toBeNull();
      expect(body.gesperrtSeit).toBeNull();
    });

    it('POST ablehnen durch eine ZWEITE Person markiert den Antrag als abgelehnt (terminal)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Gamma');
      const { id: antragId } = await beantrageShred(endkundeId);

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege/${antragId}/ablehnen`)
        .set('Authorization', `Bearer ${betrieb2Token}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ ablehnungsgrund: 'kein_rechtsgrund' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'abgelehnt',
        ablehnungsgrund: 'kein_rechtsgrund',
        freigeberSub: 'betrieb-freigeber-sub',
      });

      // Endkunde bleibt unangetastet (nicht geschreddert).
      const detail = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect((detail.body as { verarbeitungsStatus: string }).verarbeitungsStatus).toBe('aktiv');
    });
  });

  describe('Selbst-Freigabe verboten (ADR-0009 §2.2)', () => {
    it('POST freigeben durch DIESELBE Person, die den Antrag gestellt hat -> 403 (vier_augen_selbstfreigabe_verboten)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Delta');
      const { id: antragId } = await beantrageShred(endkundeId);

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege/${antragId}/freigeben`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN' });

      expect(response.status).toBe(403);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect((response.body as { detail: string }).detail).toBe('vier_augen_selbstfreigabe_verboten');

      // Der Endkunde bleibt unangetastet (kein Teil-Effekt einer abgelehnten AuthZ-Entscheidung).
      const detail = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect((detail.body as { verarbeitungsStatus: string }).verarbeitungsStatus).toBe('aktiv');
    });

    it('POST ablehnen durch DIESELBE Person, die den Antrag gestellt hat -> 403 (vier_augen_selbstfreigabe_verboten)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Epsilon');
      const { id: antragId } = await beantrageShred(endkundeId);

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege/${antragId}/ablehnen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ ablehnungsgrund: 'sonstiges' });

      expect(response.status).toBe(403);
      expect((response.body as { detail: string }).detail).toBe('vier_augen_selbstfreigabe_verboten');
    });
  });

  describe('Antrag-Scoping (Provider-Scoping, ADR-0009 §2.4/§6) — 404, nicht 403', () => {
    it('freigeben mit einer antragId, die zu einem ANDEREN Endkunden gehoert -> 404 (bestaetigt NICHT die Existenz eines fremden Antrags)', async () => {
      const { id: endkundeA } = await legeEndkundeAn('ScopeA');
      const { id: antragId } = await beantrageShred(endkundeA);
      const { id: endkundeB } = await legeEndkundeAn('ScopeB');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeB}/shred-antraege/${antragId}/freigeben`)
        .set('Authorization', `Bearer ${betrieb2Token}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN' });

      expect(response.status).toBe(404);
    });
  });

  describe('Doppelte Beantragung (Pflicht-Unique-Index, hoechstens EIN offener Antrag je Endkunde)', () => {
    it('ein ANDERER Antragsteller kann keinen zweiten Antrag stellen, waehrend einer offen ist -> 409, NICHT 500', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Zeta');
      await beantrageShred(endkundeId, betriebToken);

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege`)
        .set('Authorization', `Bearer ${betrieb2Token}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'aufbewahrung_abgelaufen' });

      expect(response.status).toBe(409);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it('derselbe Antragsteller erhaelt bei erneutem Beantragen denselben offenen Antrag zurueck (Idempotency-Replay, kein 500 ueber den Unique-Index)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Eta');
      const { id: ersterAntragId } = await beantrageShred(endkundeId, betriebToken);

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' });

      expect(response.status).toBe(201);
      expect((response.body as { id: string }).id).toBe(ersterAntragId);
    });
  });

  describe('GET Liste', () => {
    it('liefert die gestellten Antraege des Endkunden (Cursor-Seite)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Theta');
      const { id: antragId } = await beantrageShred(endkundeId);

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}/shred-antraege`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const daten = (response.body as { daten: Array<{ id: string }> }).daten;
      expect(daten.some((eintrag) => eintrag.id === antragId)).toBe(true);
    });
  });

  describe('Alter Direkt-Endpoint ENTFERNT (ADR-0009 §2.4 — hartes Cutover, kein Deprecation-Fenster)', () => {
    it('POST /stammdaten/endkunden/{endkundeId}/kryptoshredding -> 404 (Route existiert nicht mehr)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Iota');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/kryptoshredding`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' });

      expect(response.status).toBe(404);
    });
  });

  describe('M1 — Rolle × Route-Matrix', () => {
    it('anonym (kein Token) -> 401 auf GET Liste', async () => {
      const response = await request(testApp.httpServer).get(`/stammdaten/endkunden/${randomUUID()}/shred-antraege`);
      expect(response.status).toBe(401);
    });

    it('compliance-auditor -> 200 auf GET Liste (strikt lesend)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Kappa');

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}/shred-antraege`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(200);
    });

    it('compliance-auditor -> 403 auf POST beantragen (DS-01, auditor bleibt strikt lesend)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Lambda');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' });
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 403 auf POST freigeben (darf NIE freigeben, auch nicht mit gueltigem Antrag)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Mu');
      const { id: antragId } = await beantrageShred(endkundeId);

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege/${antragId}/freigeben`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN' });
      expect(response.status).toBe(403);
    });

    it('admin -> 403 auf GET Liste (admin ist KEINE Stammdaten-Rolle)', async () => {
      const response = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${randomUUID()}/shred-antraege`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(403);
    });

    it('admin -> 403 auf POST beantragen', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Nu');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' });
      expect(response.status).toBe(403);
    });

    it('fehlender Idempotency-Key -> 400 auf POST beantragen', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Xi');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' });
      expect(response.status).toBe(400);
    });
  });
});
