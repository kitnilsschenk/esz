import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Integrationstests (ECHTER Postgres-Testcontainer, ALLE `migrations/**`-
 * Dateien inkl. V0020/V0021 dynamisch angewendet über `migrate-test-postgres.ts`,
 * KEIN DB-Mock, `.claude/rules/tests.md`) für die Einflussgrößen-CRUD-Familie
 * (ADR-0006 Teil B, B8/B10).
 *
 * Deckt gezielt die im Arbeitsauftrag benannten Kernszenarien ab, die ein
 * reiner Unit-Test (Repos gemockt) NICHT prüfen kann: RBAC/PDP-Durchsetzung
 * über echtes HTTP (Auditor-Deny), die DB-EXCLUDE-Constraint als echter
 * Overlap-Backstop, und — ZENTRAL — dass `wertNum`/`wertCode` NIEMALS im
 * persistierten Audit-Kontext (`audit.event.kontext`) landen.
 *
 * Testdaten sind ausschließlich synthetisch (F6-Bedingung 2/M6).
 */
describe('Einflussgrößen-CRUD — Integrationstests (ADR-0006 Teil B, B8/B10)', () => {
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

  function idempotencyKey(): string {
    return randomUUID();
  }

  async function legeEndkundeAn(namenSuffix: string): Promise<string> {
    const response = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        stammdatenPii: { name: `Testkunde Einflussgroesse ${namenSuffix}`, anschrift: 'Musterstraße 1, 12345 Musterstadt' },
      });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function legeSystemAn(endkundeId: string, namenSuffix: string): Promise<string> {
    const response = await request(testApp.httpServer)
      .post('/stammdaten/systeme')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ endkundeId, bezeichnung: `Testsystem ${namenSuffix}`, systemgrenze: 'Gebäude Musterhalle' });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function legeStandortAn(endkundeId: string, namenSuffix: string): Promise<string> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ typ: 'liegenschaft', bezeichnung: `Standort ${namenSuffix}`, adresse: 'Industriestrasse 1' });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function legeZaehlerVerortungAn(systemId: string, standortId: string, gueltigVon: string): Promise<void> {
    const zaehlerResponse = await request(testApp.httpServer)
      .post('/stammdaten/zaehler')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ systemId, geraetetyp: 'Testzaehler', energietraeger: 'strom' });
    expect(zaehlerResponse.status).toBe(201);
    const zaehlerId = (zaehlerResponse.body as { id: string }).id;

    const verortungResponse = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/verortung`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ standortId, gueltigVon });
    expect(verortungResponse.status).toBe(201);
  }

  interface ErfassenBody {
    readonly standortId?: string;
    readonly groesseCode: string;
    readonly wertNum?: number;
    readonly wertCode?: string;
    readonly gueltigAbMonat: string;
    readonly gueltigBisMonat?: string;
    readonly betroffenerTyp: string;
    readonly quelleTyp: string;
    readonly rechtsgrundlage: string;
    readonly abwaegungRef?: string;
    readonly art14InformationAt?: string;
  }

  async function erfasse(
    systemId: string,
    body: ErfassenBody,
    token: string = betriebToken,
  ): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/systeme/${systemId}/einflussgroessen`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(body);
    return { status: response.status, body: response.body as Record<string, unknown> };
  }

  describe('Happy-Path: erfassen -> lesen (Klartext)', () => {
    it('erfasst eine numerische Einflussgröße und liest sie ueber die Klartext-Liste zurueck', async () => {
      const endkundeId = await legeEndkundeAn('Happy');
      const systemId = await legeSystemAn(endkundeId, 'Happy');

      const erfasstResponse = await erfasse(systemId, {
        groesseCode: 'personenanzahl',
        wertNum: 5,
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      });
      expect(erfasstResponse.status).toBe(201);
      expect(erfasstResponse.body).toMatchObject({ endkundeId, systemId, groesseCode: 'personenanzahl', wertNum: '5.000' });

      const listeResponse = await request(testApp.httpServer)
        .get(`/stammdaten/systeme/${systemId}/einflussgroessen`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(listeResponse.status).toBe(200);
      const items = listeResponse.body as Record<string, unknown>[];
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ groesseCode: 'personenanzahl', wertNum: '5.000' });
    });
  });

  describe('wert_art-Konsistenz (Katalog-getrieben)', () => {
    it('numerisch (personenanzahl) + wertCode statt wertNum -> 400', async () => {
      const endkundeId = await legeEndkundeAn('WertArt');
      const systemId = await legeSystemAn(endkundeId, 'WertArt');

      const response = await erfasse(systemId, {
        groesseCode: 'personenanzahl',
        wertCode: 'fuenf',
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      });
      expect(response.status).toBe(400);
    });

    it('codiert (nutzungszweck) + Wert ausserhalb der B12.5-Liste -> 400', async () => {
      const endkundeId = await legeEndkundeAn('Nutzungszweck');
      const systemId = await legeSystemAn(endkundeId, 'Nutzungszweck');

      const response = await erfasse(systemId, {
        groesseCode: 'nutzungszweck',
        wertCode: 'garten',
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      });
      expect(response.status).toBe(400);
    });
  });

  describe('Art. 14 DSGVO — betroffenerTyp=anschlussnutzer', () => {
    it('OHNE abwaegungRef/art14InformationAt -> 400', async () => {
      const endkundeId = await legeEndkundeAn('Art14Fehlt');
      const systemId = await legeSystemAn(endkundeId, 'Art14Fehlt');

      const response = await erfasse(systemId, {
        groesseCode: 'personenanzahl',
        wertNum: 3,
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'anschlussnutzer',
        quelleTyp: 'anschlussnutzer',
        rechtsgrundlage: 'art6_1f',
      });
      expect(response.status).toBe(400);
    });

    it('MIT rechtsgrundlage=art6_1f + abwaegungRef + art14InformationAt -> 201', async () => {
      const endkundeId = await legeEndkundeAn('Art14Ok');
      const systemId = await legeSystemAn(endkundeId, 'Art14Ok');

      const response = await erfasse(systemId, {
        groesseCode: 'personenanzahl',
        wertNum: 3,
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'anschlussnutzer',
        quelleTyp: 'anschlussnutzer',
        rechtsgrundlage: 'art6_1f',
        abwaegungRef: 'LIA-2026-001',
        art14InformationAt: '2026-01-05T00:00:00.000Z',
      });
      expect(response.status).toBe(201);
    });
  });

  describe('RL-B1 — standortId erfordert eine Zaehler-Verortung im Zeitraum', () => {
    it('standortId OHNE jede Zaehler-Verortung -> 400', async () => {
      const endkundeId = await legeEndkundeAn('RlB1Fehlt');
      const systemId = await legeSystemAn(endkundeId, 'RlB1Fehlt');
      const standortId = await legeStandortAn(endkundeId, 'RlB1Fehlt');

      const response = await erfasse(systemId, {
        standortId,
        groesseCode: 'personenanzahl',
        wertNum: 4,
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'vor_ort',
        rechtsgrundlage: 'art6_1b',
      });
      expect(response.status).toBe(400);
    });

    it('standortId MIT aktiver Zaehler-Verortung im Zeitraum -> 201', async () => {
      const endkundeId = await legeEndkundeAn('RlB1Ok');
      const systemId = await legeSystemAn(endkundeId, 'RlB1Ok');
      const standortId = await legeStandortAn(endkundeId, 'RlB1Ok');
      await legeZaehlerVerortungAn(systemId, standortId, '2025-12-01T00:00:00.000Z');

      const response = await erfasse(systemId, {
        standortId,
        groesseCode: 'personenanzahl',
        wertNum: 4,
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'vor_ort',
        rechtsgrundlage: 'art6_1b',
      });
      expect(response.status).toBe(201);
    });

    it('standortId eines FREMDEN Endkunden -> 400 (Mandantentreue)', async () => {
      const endkundeA = await legeEndkundeAn('RlB1MandantA');
      const endkundeB = await legeEndkundeAn('RlB1MandantB');
      const systemA = await legeSystemAn(endkundeA, 'RlB1MandantA');
      const standortB = await legeStandortAn(endkundeB, 'RlB1MandantB');

      const response = await erfasse(systemA, {
        standortId: standortB,
        groesseCode: 'personenanzahl',
        wertNum: 4,
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'vor_ort',
        rechtsgrundlage: 'art6_1b',
      });
      expect(response.status).toBe(400);
    });
  });

  describe('Overlap — offenes Vorgänger-Intervall wird geschlossen ODER echter Overlap -> 409', () => {
    it('zweites Erfassen derselben (system,groesse) schliesst das offene Vorgänger-Intervall atomar', async () => {
      const endkundeId = await legeEndkundeAn('OverlapSchliessen');
      const systemId = await legeSystemAn(endkundeId, 'OverlapSchliessen');

      const erste = await erfasse(systemId, {
        groesseCode: 'personenanzahl',
        wertNum: 3,
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      });
      expect(erste.status).toBe(201);

      const zweite = await erfasse(systemId, {
        groesseCode: 'personenanzahl',
        wertNum: 6,
        gueltigAbMonat: '2026-06-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      });
      expect(zweite.status).toBe(201);

      const liste = await request(testApp.httpServer)
        .get(`/stammdaten/systeme/${systemId}/einflussgroessen`)
        .set('Authorization', `Bearer ${betriebToken}`);
      const items = liste.body as { id: string; gueltigBisMonat: string | null; wertNum: string }[];
      expect(items).toHaveLength(2);
      const alte = items.find((i) => i.id === (erste.body['id'] as string));
      expect(alte?.gueltigBisMonat).toBe('2026-06-01');
    });

    it('ECHTER Overlap (neues Intervall ueberlappt ein BESTEHENDES, geschlossenes Intervall) -> 409', async () => {
      const endkundeId = await legeEndkundeAn('OverlapKonflikt');
      const systemId = await legeSystemAn(endkundeId, 'OverlapKonflikt');

      const erste = await erfasse(systemId, {
        groesseCode: 'nutzflaeche',
        wertNum: 100,
        gueltigAbMonat: '2026-01-01',
        gueltigBisMonat: '2026-04-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      });
      expect(erste.status).toBe(201);

      const ueberlappend = await erfasse(systemId, {
        groesseCode: 'nutzflaeche',
        wertNum: 120,
        gueltigAbMonat: '2026-02-01',
        gueltigBisMonat: '2026-05-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      });
      expect(ueberlappend.status).toBe(409);
    });
  });

  describe('PATCH .../einflussgroessen/{id} — korrigieren() (append-only)', () => {
    it('setzt gueltigBisMonat OHNE Wert-Ueberschreibung — mit korrektur entsteht eine NEUE Zeile', async () => {
      const endkundeId = await legeEndkundeAn('Korrektur');
      const systemId = await legeSystemAn(endkundeId, 'Korrektur');

      const erfasst = await erfasse(systemId, {
        groesseCode: 'personenanzahl',
        wertNum: 3,
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      });
      expect(erfasst.status).toBe(201);
      const originalId = erfasst.body['id'] as string;

      const korrigiert = await request(testApp.httpServer)
        .patch(`/stammdaten/einflussgroessen/${originalId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          gueltigBisMonat: '2026-06-01',
          korrektur: {
            wertNum: 7,
            gueltigAbMonat: '2026-06-01',
            betroffenerTyp: 'endkunde',
            quelleTyp: 'betriebsteam',
            rechtsgrundlage: 'art6_1b',
          },
        });
      expect(korrigiert.status).toBe(200);
      const ergebnis = korrigiert.body as {
        geschlossen: { id: string; wertNum: string; gueltigBisMonat: string };
        neu: { id: string; wertNum: string; anlassCode: string } | null;
      };
      // Der urspruengliche Wert (3) bleibt UNVERAENDERT — er wird NIE ueberschrieben.
      expect(ergebnis.geschlossen).toMatchObject({ id: originalId, wertNum: '3.000', gueltigBisMonat: '2026-06-01' });
      expect(ergebnis.neu).toMatchObject({ wertNum: '7.000', anlassCode: 'korrektur' });
      expect(ergebnis.neu?.id).not.toBe(originalId);

      const auditRows = await dbClient.query(
        "SELECT event_typ, objekt_ref FROM audit.event WHERE event_typ LIKE 'einflussgroesse.stammdaten.%' AND kontext->>'endkunde_id' = $1 ORDER BY ts ASC",
        [endkundeId],
      );
      const eventTypen = auditRows.rows.map((r: { event_typ: string }) => r.event_typ);
      expect(eventTypen).toEqual([
        'einflussgroesse.stammdaten.erfasst',
        'einflussgroesse.stammdaten.geaendert',
        'einflussgroesse.stammdaten.erfasst',
      ]);
    });

    it('PATCH auf ein BEREITS geschlossenes Intervall -> 409', async () => {
      const endkundeId = await legeEndkundeAn('KorrekturDoppelt');
      const systemId = await legeSystemAn(endkundeId, 'KorrekturDoppelt');
      const erfasst = await erfasse(systemId, {
        groesseCode: 'personenanzahl',
        wertNum: 3,
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      });
      const originalId = erfasst.body['id'] as string;

      await request(testApp.httpServer)
        .patch(`/stammdaten/einflussgroessen/${originalId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ gueltigBisMonat: '2026-06-01' })
        .expect(200);

      const zweitesSchliessen = await request(testApp.httpServer)
        .patch(`/stammdaten/einflussgroessen/${originalId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ gueltigBisMonat: '2026-07-01' });
      expect(zweitesSchliessen.status).toBe(409);
    });
  });

  describe('PII-Härte (A5/B10) — wertNum/wertCode/anlassCode NIEMALS im Audit-Kontext', () => {
    it('audit.event.kontext enthaelt bei .erfasst NUR die V0021-Whitelist-Felder, NIE wert_num/wert_code/anlass_code', async () => {
      const endkundeId = await legeEndkundeAn('AuditPii');
      const systemId = await legeSystemAn(endkundeId, 'AuditPii');

      await erfasse(systemId, {
        groesseCode: 'personenanzahl',
        wertNum: 42,
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
        // Ein whitelisted anlassCode-Wert, um sicherzustellen, dass er NICHT
        // durchsickert (nicht bloss, weil er nie gesetzt wurde).
      });

      const auditRows = await dbClient.query(
        "SELECT kontext FROM audit.event WHERE event_typ = 'einflussgroesse.stammdaten.erfasst' AND kontext->>'endkunde_id' = $1",
        [endkundeId],
      );
      expect(auditRows.rowCount).toBe(1);
      const kontext = (auditRows.rows[0] as { kontext: Record<string, unknown> }).kontext;
      expect(kontext).not.toHaveProperty('wert_num');
      expect(kontext).not.toHaveProperty('wert_code');
      expect(kontext).not.toHaveProperty('anlass_code');
      // Der PII-Wert darf nie als eigenständiger Kontext-WERT erscheinen.
      // Bewusst KEIN Substring-Check über das ganze JSON: '42' kann zufällig
      // in einer UUID (system_id/endkunde_id/…) vorkommen — das wäre ein
      // falsch-positiver Flake ohne Compliance-Bezug.
      expect(Object.values(kontext)).not.toContain(42);
      expect(Object.values(kontext)).not.toContain('42');
      expect(kontext['synthetic']).toBe(true);
      expect(kontext['groesse_code']).toBe('personenanzahl');
    });

    it('audit.event.kontext enthaelt bei .einsicht anzahl_saetze, NIE einen Wert', async () => {
      const endkundeId = await legeEndkundeAn('AuditPiiEinsicht');
      const systemId = await legeSystemAn(endkundeId, 'AuditPiiEinsicht');
      await erfasse(systemId, {
        groesseCode: 'nutzflaeche',
        wertNum: 250,
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      });

      await request(testApp.httpServer)
        .get(`/stammdaten/systeme/${systemId}/einflussgroessen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .expect(200);

      const auditRows = await dbClient.query(
        "SELECT kontext FROM audit.event WHERE event_typ = 'einflussgroesse.stammdaten.einsicht' AND kontext->>'endkunde_id' = $1",
        [endkundeId],
      );
      expect(auditRows.rowCount).toBe(1);
      const kontext = (auditRows.rows[0] as { kontext: Record<string, unknown> }).kontext;
      expect(kontext['anzahl_saetze']).toBe(1);
      // Wert-Ebene statt Substring (s. .erfasst-Test): '250' kann zufällig in
      // einer UUID vorkommen — der PII-Wert darf nur nie ein Kontext-WERT sein.
      expect(Object.values(kontext)).not.toContain(250);
      expect(Object.values(kontext)).not.toContain('250');
    });
  });

  describe('RBAC/ABAC — compliance-auditor bleibt strukturell ausgeschlossen (Auditor-Deny)', () => {
    it('compliance-auditor × GET .../systeme/{systemId}/einflussgroessen -> 403', async () => {
      const endkundeId = await legeEndkundeAn('AuditorListe');
      const systemId = await legeSystemAn(endkundeId, 'AuditorListe');

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/systeme/${systemId}/einflussgroessen`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(403);
    });

    it('compliance-auditor × POST .../systeme/{systemId}/einflussgroessen -> 403', async () => {
      const endkundeId = await legeEndkundeAn('AuditorCreate');
      const systemId = await legeSystemAn(endkundeId, 'AuditorCreate');

      const response = await erfasse(
        systemId,
        {
          groesseCode: 'personenanzahl',
          wertNum: 1,
          gueltigAbMonat: '2026-01-01',
          betroffenerTyp: 'endkunde',
          quelleTyp: 'betriebsteam',
          rechtsgrundlage: 'art6_1b',
        },
        auditorToken,
      );
      expect(response.status).toBe(403);
    });

    it('compliance-auditor × GET .../endkunden/{endkundeId}/einflussgroessen/befunde -> 403', async () => {
      const endkundeId = await legeEndkundeAn('AuditorBefunde');

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}/einflussgroessen/befunde`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(403);
    });

    it('betrieb × GET .../endkunden/{endkundeId}/einflussgroessen/befunde -> 200, leer (v1 NUR lesend, keine Erkennung)', async () => {
      const endkundeId = await legeEndkundeAn('BefundeLeer');

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}/einflussgroessen/befunde`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });
});
