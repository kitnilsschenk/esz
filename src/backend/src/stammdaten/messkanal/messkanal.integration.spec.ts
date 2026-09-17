import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer, KEIN
 * DB-Mock, `.claude/rules/tests.md`) für BEIDE Messkanal-Controller —
 * `MesskanalUnterZaehlerController` (`/stammdaten/zaehler/{zaehlerId}/
 * messkanaele`) UND `MesskanalController` (`/stammdaten/messkanaele/
 * {messkanalId}`) — schließt die Merge-Blocker-Lücke aus dem Phase-4-Review.
 * Muster 1:1 aus `stammdaten.integration.spec.ts` übernommen.
 */
describe('Messkanal-Controller — Integrationstests (ADR-0008 Teil B, Phase 4)', () => {
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

  async function legeZaehlerAn(namenSuffix: string): Promise<{ zaehlerId: string }> {
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

    return { zaehlerId: (zaehlerResponse.body as { id: string }).id };
  }

  async function legeMesskanalAn(zaehlerId: string): Promise<{ id: string }> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
    expect(response.status).toBe(201);
    return { id: (response.body as { id: string }).id };
  }

  describe('MesskanalUnterZaehlerController — Liste + Anlegen (/stammdaten/zaehler/{zaehlerId}/messkanaele)', () => {
    it('POST legt einen Messkanal an, wenn der Zaehler existiert (Happy Path)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Alpha');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });

      expect(response.status).toBe(201);
      expect(response.headers['location']).toBe(`/stammdaten/messkanaele/${(response.body as { id: string }).id}`);
      expect(response.body).toMatchObject({ zaehlerId, messgroesse: 'wirkarbeit', einheit: 'kWh', status: 'aktiv' });
    });

    it('POST lehnt ab (404), wenn der referenzierte Zaehler nicht existiert', async () => {
      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${randomUUID()}/messkanaele`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it('POST lehnt ab (409 Konflikt) bei doppelter Kombination Zaehler/Messgroesse/OBIS-Kennzahl (OBIS gesetzt)', async () => {
      // Bewusst MIT gesetzter obisKennzahl auf beiden Aufrufen: die DB-UNIQUE-
      // Constraint ist `UNIQUE (zaehler_id, messgroesse, obis_kennzahl)` —
      // Postgres behandelt zwei NULL-Werte in einer UNIQUE-Constraint NICHT
      // als Duplikat (NULL <> NULL). Ohne obisKennzahl (NULL) wuerde diese
      // Constraint NICHT greifen, s. separierter Test weiter unten
      // ("dokumentierte Lücke") + Abschlussbericht (Produktbug-Kandidat).
      const { zaehlerId } = await legeZaehlerAn('Beta');
      const erste = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand', obisKennzahl: '1-1:1.8.0' });
      expect(erste.status).toBe(201);

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand', obisKennzahl: '1-1:1.8.0' });

      expect(response.status).toBe(409);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it(
      'DOKUMENTIERTE LUECKE (kein Produktcode-Fix in diesem Paket, s. Abschlussbericht): OHNE obisKennzahl ' +
        '(NULL) verhindert die UNIQUE-Constraint (zaehler_id, messgroesse, obis_kennzahl) KEINE Duplikate ' +
        '(Postgres: NULL <> NULL) — zwei identische Kanaele fuer denselben Zaehler/dieselbe Messgroesse werden ' +
        'beide angelegt, obwohl der Migrations-Kommentar (V0002) genau das verhindern soll',
      async () => {
        const { zaehlerId } = await legeZaehlerAn('BetaOhneObis');

        const erste = await request(testApp.httpServer)
          .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
          .set('Authorization', `Bearer ${betriebToken}`)
          .set('Idempotency-Key', idempotencyKey())
          .send({ messgroesse: 'thermische_energie', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
        expect(erste.status).toBe(201);

        const zweite = await request(testApp.httpServer)
          .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
          .set('Authorization', `Bearer ${betriebToken}`)
          .set('Idempotency-Key', idempotencyKey())
          .send({ messgroesse: 'thermische_energie', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });

        // Aktuelles (ueberraschendes) Verhalten: KEIN 409, obwohl es sich um
        // exakt denselben Zaehler + dieselbe Messgroesse handelt.
        expect(zweite.status).toBe(201);
      },
    );

    it('GET Liste liefert 404, wenn der Zaehler nicht existiert', async () => {
      const response = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${randomUUID()}/messkanaele`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(response.status).toBe(404);
    });

    it('GET Liste enthaelt den angelegten Messkanal', async () => {
      const { zaehlerId } = await legeZaehlerAn('Gamma');
      const { id: messkanalId } = await legeMesskanalAn(zaehlerId);

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const daten = (response.body as { daten: Array<{ id: string }> }).daten;
      expect(daten.some((eintrag) => eintrag.id === messkanalId)).toBe(true);
    });
  });

  describe('MesskanalController — Lesen/Aendern/Stilllegen (/stammdaten/messkanaele/{messkanalId})', () => {
    it('GET Detail liefert 404 fuer eine unbekannte Messkanal-ID', async () => {
      const response = await request(testApp.httpServer)
        .get(`/stammdaten/messkanaele/${randomUUID()}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(response.status).toBe(404);
    });

    it('PATCH aendert die einheit eines bestehenden Messkanals', async () => {
      const { zaehlerId } = await legeZaehlerAn('Delta');
      const { id: messkanalId } = await legeMesskanalAn(zaehlerId);

      const response = await request(testApp.httpServer)
        .patch(`/stammdaten/messkanaele/${messkanalId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ einheit: 'MWh' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ einheit: 'MWh' });
    });

    it('PATCH lehnt ab (400), wenn weder einheit noch obisKennzahl gesetzt sind (minProperties:1)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Epsilon');
      const { id: messkanalId } = await legeMesskanalAn(zaehlerId);

      const response = await request(testApp.httpServer)
        .patch(`/stammdaten/messkanaele/${messkanalId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({});

      expect(response.status).toBe(400);
    });

    it('DELETE (stilllegen) setzt den Status auf stillgelegt und ist idempotent (kein Hard-Delete, Linie 3)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Zeta');
      const { id: messkanalId } = await legeMesskanalAn(zaehlerId);

      const erste = await request(testApp.httpServer)
        .delete(`/stammdaten/messkanaele/${messkanalId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(erste.status).toBe(200);
      expect((erste.body as { status: string }).status).toBe('stillgelegt');

      const zweite = await request(testApp.httpServer)
        .delete(`/stammdaten/messkanaele/${messkanalId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(zweite.status).toBe(200);
      expect((zweite.body as { status: string }).status).toBe('stillgelegt');
    });

    it('DELETE liefert 404 fuer eine unbekannte Messkanal-ID', async () => {
      const response = await request(testApp.httpServer)
        .delete(`/stammdaten/messkanaele/${randomUUID()}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(response.status).toBe(404);
    });
  });

  describe('M1 — Rolle × Route-Matrix (Messkanal, beide Controller)', () => {
    it('anonym (kein Token) -> 401 auf GET /stammdaten/zaehler/{zaehlerId}/messkanaele', async () => {
      const response = await request(testApp.httpServer).get(`/stammdaten/zaehler/${randomUUID()}/messkanaele`);
      expect(response.status).toBe(401);
    });

    it('anonym (kein Token) -> 401 auf GET /stammdaten/messkanaele/{id}', async () => {
      const response = await request(testApp.httpServer).get(`/stammdaten/messkanaele/${randomUUID()}`);
      expect(response.status).toBe(401);
    });

    it('admin -> 403 auf GET /stammdaten/zaehler/{zaehlerId}/messkanaele', async () => {
      const response = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${randomUUID()}/messkanaele`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(403);
    });

    it('admin -> 403 auf POST /stammdaten/zaehler/{zaehlerId}/messkanaele', async () => {
      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${randomUUID()}/messkanaele`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 200 auf GET /stammdaten/zaehler/{zaehlerId}/messkanaele (Liste)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Eta');

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(200);
    });

    it('compliance-auditor -> 200 auf GET /stammdaten/messkanaele/{id} (Detail)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Theta');
      const { id: messkanalId } = await legeMesskanalAn(zaehlerId);

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/messkanaele/${messkanalId}`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(200);
    });

    it('compliance-auditor -> 403 auf POST (Anlegen, DS-01)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Iota');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 403 auf PATCH', async () => {
      const { zaehlerId } = await legeZaehlerAn('Kappa');
      const { id: messkanalId } = await legeMesskanalAn(zaehlerId);

      const response = await request(testApp.httpServer)
        .patch(`/stammdaten/messkanaele/${messkanalId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ einheit: 'Sollte nie ankommen' });
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 403 auf DELETE (Stilllegung)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Lambda');
      const { id: messkanalId } = await legeMesskanalAn(zaehlerId);

      const response = await request(testApp.httpServer)
        .delete(`/stammdaten/messkanaele/${messkanalId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(response.status).toBe(403);
    });

    it('betrieb -> 201 auf POST (Referenz-Happy-Path)', async () => {
      const { zaehlerId } = await legeZaehlerAn('Mu');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
      expect(response.status).toBe(201);
    });

    it('fehlender Idempotency-Key -> 400 auf POST', async () => {
      const { zaehlerId } = await legeZaehlerAn('Nu');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .send({ messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
      expect(response.status).toBe(400);
    });
  });
});
