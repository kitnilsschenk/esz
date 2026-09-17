import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';
import { GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H } from '../../auth/policy/geraet-reverse.constants';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer,
 * `migrations/V0001`-`V0015` angewendet dynamisch, KEIN DB-Mock,
 * `.claude/rules/tests.md`) fuer die SEC-5-break-glass-gehaertete
 * Reverse-Aufloesung (ADR-0005 §26.4 SEC-5, `read:geraet_zuordnung`).
 *
 * Testdaten sind ausschliesslich synthetisch (Test-DevEUIs, `@example.invalid`-
 * Domains, "Testkunde"/"Musterstrasse"-Marker, F6-Bedingung 2/M6).
 */
describe('Geraet-Reverse-Aufloesung — Integrationstests (ADR-0005 §26.4 SEC-5)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let auditorToken: string;
  let adminToken: string;
  let geraeteSupportToken: string;
  let auditClient: Client;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-sub', ['compliance-auditor']);
    adminToken = await testApp.signToken('admin-sub', ['admin']);
    geraeteSupportToken = await testApp.signToken('geraete-support-sub', ['geraete-support']);

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

  function testDevEui(): string {
    return randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  }

  async function legeGeraetZuordnungAn(
    namenSuffix: string,
    devEui: string = testDevEui(),
  ): Promise<{ zuordnungId: string; zaehlerId: string; devEui: string }> {
    const endkundeResponse = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        stammdatenPii: { name: `Testkunde Reverse ${namenSuffix}`, anschrift: 'Musterstraße 1, 12345 Musterstadt' },
      });
    expect(endkundeResponse.status).toBe(201);
    const endkundeId = (endkundeResponse.body as { id: string }).id;

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
    const zaehlerId = (zaehlerResponse.body as { id: string }).id;

    const zuordnungResponse = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ devEui });
    expect(zuordnungResponse.status).toBe(201);

    return { zuordnungId: (zuordnungResponse.body as { id: string }).id, zaehlerId, devEui };
  }

  async function fuelleAuditHistorieAuf(actorSub: string, zaehlerId: string, anzahl: number): Promise<void> {
    const kontext = JSON.stringify({
      synthetic: true,
      zaehler_id: zaehlerId,
      zweck: 'geraete_stoerungsdiagnose',
      ticket_ref: 'HD-0',
    });

    for (let i = 0; i < anzahl; i += 1) {
      await auditClient.query(
        `SELECT * FROM audit.append_event($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
        [
          'geraet_zuordnung.stammdaten.reverse_aufgeloest',
          'benutzer',
          'ok',
          actorSub,
          'geraete-support',
          randomUUID(),
          kontext,
          null,
          null,
          1,
        ],
      );
    }
  }

  describe('Happy Path — permit', () => {
    it('geraete-support + gueltiger zweck + gueltiges Ticket + Quota frei -> 200 mit Klartext-devEui', async () => {
      const { zuordnungId, zaehlerId, devEui } = await legeGeraetZuordnungAn('Alpha');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/geraet-zuordnungen/${zuordnungId}/reverse-aufloesung`)
        .set('Authorization', `Bearer ${geraeteSupportToken}`)
        .send({ zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-1' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: zuordnungId, zaehlerId, devEui });
    });

    it('Audit-Zeile "geraet_zuordnung.stammdaten.reverse_aufgeloest" traegt EXAKT {synthetic,zaehler_id,zweck,ticket_ref} im Kontext, ergebnis=ok', async () => {
      const { zuordnungId, zaehlerId } = await legeGeraetZuordnungAn('Beta');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/geraet-zuordnungen/${zuordnungId}/reverse-aufloesung`)
        .set('Authorization', `Bearer ${geraeteSupportToken}`)
        .send({ zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-2' });
      expect(response.status).toBe(200);

      const row = await auditClient.query(
        "SELECT kontext, ergebnis FROM audit.event WHERE event_typ = 'geraet_zuordnung.stammdaten.reverse_aufgeloest' AND objekt_ref = $1 AND ergebnis = 'ok'",
        [zuordnungId],
      );
      expect(row.rowCount).toBe(1);
      const kontext = (row.rows[0] as { kontext: Record<string, unknown> }).kontext;
      expect(Object.keys(kontext).sort()).toEqual(['synthetic', 'ticket_ref', 'zaehler_id', 'zweck']);
      expect(kontext['zaehler_id']).toBe(zaehlerId);
      expect(kontext['zweck']).toBe('geraete_stoerungsdiagnose');
      expect(kontext['ticket_ref']).toBe('HD-2');
      expect(kontext['synthetic']).toBe(true);
      // RL-2 — niemals DevEUI/Blind-Index im Kontext.
      expect(JSON.stringify(kontext)).not.toMatch(/[0-9A-F]{16}/);
    });
  });

  describe('Deny je Einzelbedingung (SEC-5 (a)-(d))', () => {
    it('betrieb (KEINE geraete-support-Rolle) -> 403 (RBAC-Gate rolle_fehlt)', async () => {
      const { zuordnungId } = await legeGeraetZuordnungAn('Gamma');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/geraet-zuordnungen/${zuordnungId}/reverse-aufloesung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .send({ zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-3' });

      expect(response.status).toBe(403);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it('compliance-auditor -> 403 (DS-01, strikt lesend, auch ohne geraete-support-Rolle)', async () => {
      const { zuordnungId } = await legeGeraetZuordnungAn('Delta');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/geraet-zuordnungen/${zuordnungId}/reverse-aufloesung`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-4' });

      expect(response.status).toBe(403);
    });

    it('admin -> 403 (admin ist KEINE geraete-support-Rolle)', async () => {
      const { zuordnungId } = await legeGeraetZuordnungAn('Epsilon');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/geraet-zuordnungen/${zuordnungId}/reverse-aufloesung`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-5' });

      expect(response.status).toBe(403);
    });

    it('fehlendes ticketRef -> 403 (geraet_reverse_ticket_fehlt, ABAC laeuft VOR der DTO-Validierung)', async () => {
      const { zuordnungId } = await legeGeraetZuordnungAn('Zeta');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/geraet-zuordnungen/${zuordnungId}/reverse-aufloesung`)
        .set('Authorization', `Bearer ${geraeteSupportToken}`)
        .send({ zweck: 'geraete_stoerungsdiagnose' });

      expect(response.status).toBe(403);
    });

    it('zweck nicht in der Whitelist -> 403 (geraet_reverse_zweck_fehlt)', async () => {
      const { zuordnungId } = await legeGeraetZuordnungAn('Eta');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/geraet-zuordnungen/${zuordnungId}/reverse-aufloesung`)
        .set('Authorization', `Bearer ${geraeteSupportToken}`)
        .send({ zweck: 'neugier', ticketRef: 'HD-6' });

      expect(response.status).toBe(403);
    });

    it('unbekannte Geraete-Zuordnungs-ID -> 403 (geraet_reverse_ressource_ungueltig, fail-closed statt 404-Durchrutscher)', async () => {
      const response = await request(testApp.httpServer)
        .post(`/stammdaten/geraet-zuordnungen/${randomUUID()}/reverse-aufloesung`)
        .set('Authorization', `Bearer ${geraeteSupportToken}`)
        .send({ zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-7' });

      expect(response.status).toBe(403);
    });

    it('DENY wird ebenfalls auditiert (ergebnis=denied), Kontext traegt zweck/ticket_ref aus dem Request-Body', async () => {
      const { zuordnungId } = await legeGeraetZuordnungAn('Theta');

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/geraet-zuordnungen/${zuordnungId}/reverse-aufloesung`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-8' });
      expect(response.status).toBe(403);

      const row = await auditClient.query(
        "SELECT kontext, ergebnis FROM audit.event WHERE event_typ = 'geraet_zuordnung.stammdaten.reverse_aufgeloest' AND objekt_ref = $1 AND ergebnis = 'denied'",
        [zuordnungId],
      );
      expect(row.rowCount).toBeGreaterThanOrEqual(1);
      const kontext = (row.rows[0] as { kontext: Record<string, unknown> }).kontext;
      expect(kontext['zweck']).toBe('geraete_stoerungsdiagnose');
      expect(kontext['ticket_ref']).toBe('HD-8');
    });
  });

  describe('Velocity/Quota (SEC-5 (d)) — Audit-Trail als Quelle der Wahrheit', () => {
    it(
      `nach ${String(GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H)} bereits erfolgreichen Aufloesungen desselben Subjekts im Fenster -> die naechste (` +
        `${String(GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H + 1)}.) wird abgelehnt (403 geraet_reverse_quota_ueberschritten)`,
      async () => {
        const quotaSubjektToken = await testApp.signToken('geraete-support-quota-sub', ['geraete-support']);
        const { zuordnungId, zaehlerId } = await legeGeraetZuordnungAn('Iota');

        await fuelleAuditHistorieAuf('geraete-support-quota-sub', zaehlerId, GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H);

        const response = await request(testApp.httpServer)
          .post(`/stammdaten/geraet-zuordnungen/${zuordnungId}/reverse-aufloesung`)
          .set('Authorization', `Bearer ${quotaSubjektToken}`)
          .send({ zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-9' });

        expect(response.status).toBe(403);
      },
    );

    it('unterhalb der Quota (Anzahl < GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H) bleibt permit', async () => {
      const quotaSubjektToken = await testApp.signToken('geraete-support-quota-frei-sub', ['geraete-support']);
      const { zuordnungId, zaehlerId, devEui } = await legeGeraetZuordnungAn('Kappa');

      await fuelleAuditHistorieAuf('geraete-support-quota-frei-sub', zaehlerId, GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H - 1);

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/geraet-zuordnungen/${zuordnungId}/reverse-aufloesung`)
        .set('Authorization', `Bearer ${quotaSubjektToken}`)
        .send({ zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-10' });

      expect(response.status).toBe(200);
      expect((response.body as { devEui: string }).devEui).toBe(devEui);
    });

    it('abgelehnte (denied) Vorversuche zaehlen NICHT gegen die Quota (nur ergebnis=ok)', async () => {
      const quotaSubjektToken = await testApp.signToken('geraete-support-quota-denied-sub', ['geraete-support']);
      const { zuordnungId } = await legeGeraetZuordnungAn('Lambda');

      // GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H mal mit falschem Zweck versuchen
      // (jedes Mal denied, RBAC/ABAC gilt weiterhin, Rolle ist aber korrekt).
      for (let i = 0; i < GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H; i += 1) {
        const versuch = await request(testApp.httpServer)
          .post(`/stammdaten/geraet-zuordnungen/${zuordnungId}/reverse-aufloesung`)
          .set('Authorization', `Bearer ${quotaSubjektToken}`)
          .send({ zweck: 'neugier', ticketRef: 'HD-11' });
        expect(versuch.status).toBe(403);
      }

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/geraet-zuordnungen/${zuordnungId}/reverse-aufloesung`)
        .set('Authorization', `Bearer ${quotaSubjektToken}`)
        .send({ zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-12' });

      expect(response.status).toBe(200);
    });

    it(
      'SA-1-Regressionstest (TOCTOU-Race, Security-Review Phase 5): ECHT PARALLELE Anfragen ' +
        'desselben Subjekts ueberschreiten die Quota NIE — ein rein sequenzieller Testlauf wuerde ' +
        'diese Race NICHT fangen, daher Promise.all ueber mehr gleichzeitige Anfragen als noch ' +
        'freie Quota-Slots vorhanden sind',
      async () => {
        const raceSub = 'geraete-support-race-sub';
        const raceToken = await testApp.signToken(raceSub, ['geraete-support']);
        const { zuordnungId, zaehlerId } = await legeGeraetZuordnungAn('Race');

        // 3 freie Slots vor Erreichen der Quota, aber 6 GLEICHZEITIGE Anfragen
        // (doppelt so viele wie noch erlaubt) — ohne den SA-1-Fix wuerden ALLE
        // 6 Anfragen denselben (noch nicht durch Konkurrenz-Commits erhoehten)
        // Zaehlerstand von 17 sehen und samt und sonders permit erhalten.
        const verbleibendeSlots = 3;
        const gleichzeitigeAnfragen = 6;
        await fuelleAuditHistorieAuf(raceSub, zaehlerId, GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H - verbleibendeSlots);

        const antworten = await Promise.all(
          Array.from({ length: gleichzeitigeAnfragen }, (_unused, i) =>
            request(testApp.httpServer)
              .post(`/stammdaten/geraet-zuordnungen/${zuordnungId}/reverse-aufloesung`)
              .set('Authorization', `Bearer ${raceToken}`)
              .send({ zweck: 'geraete_stoerungsdiagnose', ticketRef: `HD-9${String(i)}` }),
          ),
        );

        const erfolge = antworten.filter((response) => response.status === 200);
        const abgelehnte = antworten.filter((response) => response.status === 403);
        const statusVerteilung = antworten.map((response) => response.status).sort().join(',');

        // SICHERHEITS-INVARIANTE (das eigentliche SA-1-Kriterium, darf NIE
        // flaky sein): es duerfen NIE MEHR als `verbleibendeSlots` Anfragen
        // einen permit erhalten. Ohne den SA-1-Fix erhielten ALLE
        // `gleichzeitigeAnfragen` einen permit — genau das faengt diese
        // Obergrenze.
        expect(erfolge.length, `Quota ueberschritten! Status-Verteilung: ${statusVerteilung}`).toBeLessThanOrEqual(
          verbleibendeSlots,
        );

        // Jede Anfrage muss ENTSCHIEDEN worden sein (200 oder 403). Ein 5xx
        // wuerde sonst als "abgelehnt" durchgehen und einen Infrastruktur-
        // Fehler als Sicherheitsergebnis maskieren.
        expect(erfolge.length + abgelehnte.length, `Unentschiedene Antwort(en). Status-Verteilung: ${statusVerteilung}`).toBe(
          gleichzeitigeAnfragen,
        );

        // Liveness-Untergrenze: mindestens eine Anfrage muss durchkommen,
        // sonst waere der Lock-Pfad tot (ein Deadlock/Timeout wuerde die
        // Quota "einhalten", ohne dass die Mechanik noch funktioniert).
        expect(erfolge.length, `Keine einzige Anfrage kam durch. Status-Verteilung: ${statusVerteilung}`).toBeGreaterThan(0);

        // BEWUSST KEINE Gleichheits-Assertion (`=== verbleibendeSlots`):
        // Bei `pg_advisory_xact_lock`-Serialisierung ist genau
        // `verbleibendeSlots` zwar der ERWARTETE Ausgang, aber unter
        // Ressourcendruck (voller Suiten-Lauf, Pool-/Lock-Wartezeit) kann eine
        // Anfrage spaeter drankommen und dann korrekt abgelehnt werden — das
        // ist FAIL-CLOSED und keine Sicherheitsverletzung. Eine
        // Gleichheits-Assertion machte den Test genau dann rot, wenn die
        // Sicherheit GEHALTEN hat (real beobachtet: einmaliger Fehlschlag im
        // Vollsuiten-Lauf, in Isolation nie reproduzierbar). Der umgekehrte
        // Fall — zu WENIGE permits, weil die Mechanik zu streng ist — wird
        // vom Test "unterhalb der Quota ... bleibt permit" oben abgedeckt.

        // Bestaetigung ueber den Audit-Trail selbst (Quelle der Wahrheit,
        // s. Klassen-Dok des Repositories): GENAU die Quota-Obergrenze an
        // 'ok'-Ereignissen fuer `raceSub`, kein einziges dariiber hinaus.
        const auditRow = await auditClient.query(
          `SELECT count(*)::int AS anzahl
             FROM audit.event
            WHERE event_typ = 'geraet_zuordnung.stammdaten.reverse_aufgeloest'
              AND actor_sub = $1
              AND ergebnis = 'ok'`,
          [raceSub],
        );
        // Auch hier die Invariante statt Gleichheit: NIE mehr als die Quota an
        // 'ok'-Ereignissen — die Obergrenze ist die Sicherheitsaussage.
        expect((auditRow.rows[0] as { anzahl: number }).anzahl).toBeLessThanOrEqual(
          GERAET_REVERSE_QUOTA_JE_SUBJEKT_24H,
        );
      },
    );
  });

  describe('M1 — Rolle × Route-Matrix', () => {
    it('anonym (kein Token) -> 401', async () => {
      const response = await request(testApp.httpServer)
        .post(`/stammdaten/geraet-zuordnungen/${randomUUID()}/reverse-aufloesung`)
        .send({ zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-13' });
      expect(response.status).toBe(401);
    });
  });
});
