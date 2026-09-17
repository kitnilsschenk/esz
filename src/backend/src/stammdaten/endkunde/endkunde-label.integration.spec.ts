import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer, ALLE
 * `migrations/**` inkl. V0034 dynamisch angewendet, KEIN DB-Mock,
 * `.claude/rules/tests.md`) für die Endkunden-Label-Batch-Auflösung
 * (**ADR-0008 D12**).
 *
 * Diese Datei ist NICHT optionale Testabdeckung, sondern der geforderte
 * NACHWEIS zweier nicht verhandelbarer Auflagen des
 * `compliance-director`-Votums vom 2026-08-26. Wörtlich: „Ohne diese Tests
 * sind A4 und A5 Kommentare, keine Maßnahmen."
 *
 *   * **A4** — `PiiProjektionsPolicy` JE DATENSATZ: `aktiv` löst auf,
 *     `gesperrt` (Art. 18) und `geschreddert` (Art. 17) fallen STILL heraus.
 *   * **A5** — `compliance-auditor` erreicht die Route strukturell nicht
 *     (RBAC UND PDP-Regel `endkunde_pii_auditor_verboten`).
 *
 * Dazu die Schärfung des `technical-director` (K14-Entscheidung, 2026-08-27):
 * Die A4-Tests prüfen **das Audit-Event mit**, nicht nur die HTTP-Antwort —
 * denn nur die Differenz `anzahl_angefragt − anzahl_endkunden` belegt, dass
 * die stille Filterung tatsächlich stattgefunden hat. Ein still ausgefallener
 * Kontext-Extraktor würde weder vom `audit.event_seal()`-Trigger (prüft die
 * Whitelist nur als Teilmenge) noch vom Typsystem gefangen.
 *
 * Testdaten sind ausschließlich synthetisch (F6-Bedingung 2/M6).
 */
describe('Endkunden-Label-Batch — Integrationstests (ADR-0008 D12)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let betrieb2Token: string;
  let auditorToken: string;
  let adminToken: string;
  let dbClient: Client;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    betrieb2Token = await testApp.signToken('betrieb-freigeber-sub', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-sub', ['compliance-auditor']);
    adminToken = await testApp.signToken('admin-sub', ['admin']);

    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
  }, 120_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  function idempotencyKey(): string {
    return randomUUID();
  }

  async function legeEndkundeAn(namenSuffix: string): Promise<string> {
    const response = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        stammdatenPii: {
          name: `Testkunde Musterfirma ${namenSuffix}`,
          anschrift: 'Musterstraße 1, 12345 Musterstadt',
          kontakt: 'kontakt@example.invalid',
        },
      });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function labels(endkundeIds: readonly string[], token: string = betriebToken) {
    return request(testApp.httpServer)
      .post('/stammdaten/endkunden/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ endkundeIds });
  }

  /** Art. 18 — Sperre mit Pflicht-Grund (ADR-0007 A11.1). */
  async function sperre(endkundeId: string): Promise<void> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/sperren`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ grund: 'art18_1a_richtigkeit' });
    expect(response.status).toBe(200);
  }

  /** Art. 17 — Krypto-Shredding über den Vier-Augen-Workflow (ADR-0009). */
  async function schreddere(endkundeId: string): Promise<void> {
    const antrag = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' });
    expect(antrag.status).toBe(201);

    // Freigabe zwingend durch eine ZWEITE Person (Selbst-Freigabe -> 403).
    const freigabe = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege/${(antrag.body as { id: string }).id}/freigeben`)
      .set('Authorization', `Bearer ${betrieb2Token}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN' });
    expect(freigabe.status).toBe(200);
  }

  async function letzterAuditKontext(): Promise<Record<string, unknown>> {
    const rows = await dbClient.query(
      "SELECT kontext FROM audit.event WHERE event_typ = 'endkunde.pii.einsicht' ORDER BY ts DESC LIMIT 1",
    );
    expect(rows.rowCount).toBe(1);
    return (rows.rows[0] as { kontext: Record<string, unknown> }).kontext;
  }

  describe('A4 — PiiProjektionsPolicy je DATENSATZ (nicht je Route)', () => {
    it('löst Klartextnamen für aktive Endkunden auf und trägt AUSSCHLIESSLICH {id, name} (A1)', async () => {
      const a = await legeEndkundeAn('LabelAktivA');
      const b = await legeEndkundeAn('LabelAktivB');

      const response = await labels([a, b]);

      expect(response.status).toBe(200);
      const items = response.body as { id: string; name: string }[];
      expect(items).toEqual(
        expect.arrayContaining([
          { id: a, name: 'Testkunde Musterfirma LabelAktivA' },
          { id: b, name: 'Testkunde Musterfirma LabelAktivB' },
        ]),
      );

      // A1: keine Anschrift, kein Kontakt — bewusste Abweichung vom
      // Standort-Vorbild, das `anschrift` mitliefert.
      expect(items[0]).not.toHaveProperty('anschrift');
      expect(items[0]).not.toHaveProperty('kontakt');
      expect(JSON.stringify(response.body)).not.toContain('Musterstraße');
      expect(JSON.stringify(response.body)).not.toContain('example.invalid');
    });

    it('lässt einen GESPERRTEN Endkunden (Art. 18) STILL heraus — kein Klartext, kein 404 — und belegt das im Audit', async () => {
      // Der Kern der Auflage: Die Route bekam EINMAL `permit`. Ohne
      // Per-Datensatz-Prüfung hebelte der Batch damit die Art.-18-Sperre aus.
      const aktiv = await legeEndkundeAn('LabelAktivC');
      const gesperrt = await legeEndkundeAn('LabelGesperrt');
      await sperre(gesperrt);

      const response = await labels([aktiv, gesperrt]);

      expect(response.status).toBe(200);
      const items = response.body as { id: string; name: string }[];
      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe(aktiv);
      // Weder der Name noch ein Hinweis auf die Existenz des gesperrten Satzes.
      expect(JSON.stringify(response.body)).not.toContain('LabelGesperrt');
      expect(JSON.stringify(response.body)).not.toContain(gesperrt);

      // A6/K14-Schärfung: Die DIFFERENZ ist der einzige Beleg, dass A4 wirkt.
      const kontext = await letzterAuditKontext();
      expect(kontext['anzahl_angefragt']).toBe(2);
      expect(kontext['anzahl_endkunden']).toBe(1);
      expect(kontext['synthetic']).toBe(true);
    });

    it('lässt einen GESCHREDDERTEN Endkunden (Art. 17) STILL heraus und belegt das im Audit', async () => {
      const aktiv = await legeEndkundeAn('LabelAktivD');
      const geschreddert = await legeEndkundeAn('LabelGeschreddert');
      await schreddere(geschreddert);

      const response = await labels([aktiv, geschreddert]);

      expect(response.status).toBe(200);
      const items = response.body as { id: string; name: string }[];
      expect(items).toHaveLength(1);
      expect(items[0]?.id).toBe(aktiv);
      expect(JSON.stringify(response.body)).not.toContain('LabelGeschreddert');

      const kontext = await letzterAuditKontext();
      expect(kontext['anzahl_angefragt']).toBe(2);
      expect(kontext['anzahl_endkunden']).toBe(1);
    });

    it('liefert eine leere Liste, wenn ALLE angefragten Sätze gefiltert sind — und protokolliert anzahl_endkunden=0', async () => {
      // Der Fall „alle 100 gefiltert" muss als {angefragt: n, endkunden: 0}
      // beweisbar sein: `0 !== undefined`, der Schlüssel bleibt im Kontext.
      const gesperrt = await legeEndkundeAn('LabelAlleGefiltert');
      await sperre(gesperrt);

      const response = await labels([gesperrt]);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);

      const kontext = await letzterAuditKontext();
      expect(kontext['anzahl_angefragt']).toBe(1);
      expect(kontext['anzahl_endkunden']).toBe(0);
    });

    it('behandelt unbekannte Ids wie gefilterte — kein Existenz-Leak, kein 404', async () => {
      const aktiv = await legeEndkundeAn('LabelUnbekannt');
      const nichtExistent = randomUUID();

      const response = await labels([aktiv, nichtExistent]);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      const kontext = await letzterAuditKontext();
      expect(kontext['anzahl_angefragt']).toBe(2);
      expect(kontext['anzahl_endkunden']).toBe(1);
    });
  });

  describe('A6 — GENAU EIN Audit-Event je Aufruf', () => {
    it('erzeugt EIN Event je Aufruf, NICHT eines je Endkunde', async () => {
      const a = await legeEndkundeAn('LabelAuditA');
      const b = await legeEndkundeAn('LabelAuditB');
      const c = await legeEndkundeAn('LabelAuditC');

      const vorher = await dbClient.query("SELECT count(*)::int AS n FROM audit.event WHERE event_typ = 'endkunde.pii.einsicht'");
      await labels([a, b, c]);
      const nachher = await dbClient.query("SELECT count(*)::int AS n FROM audit.event WHERE event_typ = 'endkunde.pii.einsicht'");

      const zuwachs = (nachher.rows[0] as { n: number }).n - (vorher.rows[0] as { n: number }).n;
      expect(zuwachs).toBe(1);

      const kontext = await letzterAuditKontext();
      expect(kontext['anzahl_angefragt']).toBe(3);
      expect(kontext['anzahl_endkunden']).toBe(3);
    });

    it('schreibt WEDER die aufgelösten Ids NOCH einen Namen in den Audit-Kontext', async () => {
      // Das Audit-Log darf nicht zur zweiten Kundenkartei werden (A6).
      const a = await legeEndkundeAn('LabelKeinLeak');
      await labels([a]);

      const kontext = await letzterAuditKontext();
      expect(Object.keys(kontext).sort()).toEqual(['anzahl_angefragt', 'anzahl_endkunden', 'synthetic']);
      expect(JSON.stringify(kontext)).not.toContain('LabelKeinLeak');
      expect(JSON.stringify(kontext)).not.toContain(a);
    });
  });

  describe('A5 — compliance-auditor strukturell ausgeschlossen (Defense-in-Depth)', () => {
    it('weist compliance-auditor mit 403 ab (RBAC UND PDP-Regel endkunde_pii_auditor_verboten)', async () => {
      const a = await legeEndkundeAn('LabelAuditorDeny');

      const response = await labels([a], auditorToken);

      expect(response.status).toBe(403);
      expect(JSON.stringify(response.body)).not.toContain('LabelAuditorDeny');
    });

    it('weist admin mit 403 ab — Administration ist keine Fachrolle', async () => {
      const a = await legeEndkundeAn('LabelAdminDeny');

      expect((await labels([a], adminToken)).status).toBe(403);
    });

    it('weist anonyme Aufrufe mit 401 ab', async () => {
      const response = await request(testApp.httpServer)
        .post('/stammdaten/endkunden/labels')
        .send({ endkundeIds: [randomUUID()] });

      expect(response.status).toBe(401);
    });
  });

  describe('A2 — Mengengrenze 100 (nicht 500 wie beim Standort)', () => {
    it('weist mehr als 100 Ids an der DTO-Grenze mit 400 ab', async () => {
      const zuViele = Array.from({ length: 101 }, () => randomUUID());

      expect((await labels(zuViele)).status).toBe(400);
    });

    it('weist eine leere Liste mit 400 ab', async () => {
      expect((await labels([])).status).toBe(400);
    });

    it('weist doppelte Ids mit 400 ab (N2 — sonst ließe sich anzahl_angefragt aufblähen)', async () => {
      const a = await legeEndkundeAn('LabelDoppelt');

      expect((await labels([a, a])).status).toBe(400);
    });
  });

  describe('§13/D1 bleibt gültig — der Listenpfad ist unverändert PII-frei', () => {
    it('die Endkundenliste trägt weiterhin KEINEN Namen', async () => {
      await legeEndkundeAn('LabelListeBleibtFrei');

      const response = await request(testApp.httpServer)
        .get('/stammdaten/endkunden')
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('LabelListeBleibtFrei');
      expect(serialized).not.toContain('Musterstraße');
    });
  });
});
