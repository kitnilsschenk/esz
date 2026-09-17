import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer, KEIN
 * DB-Mock, `.claude/rules/tests.md`) für den `MonitoringController`
 * (`/monitoring/vollstaendigkeit`) — schließt die Merge-Blocker-Lücke aus dem
 * Phase-4-Review. Muster 1:1 aus `stammdaten.integration.spec.ts`
 * übernommen. `MonitoringController` ist in v1 REIN lesend (GET) — die
 * Matrix deckt daher keine Schreib-Routen ab (strukturell nicht vorhanden),
 * zusätzlich wird geprüft, dass die Antwort AUSSCHLIESSLICH Lücken-Metadaten
 * enthält (§6.5, DE-02) — kein PII-/Verbrauchsfeld.
 */
describe('MonitoringController — Integrationstests (ADR-0008 Teil B, Phase 4)', () => {
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

  describe('GET /monitoring/vollstaendigkeit — Metadaten-only (§6.5, DE-02)', () => {
    /** Liest die Luecken EINES Endkunden. */
    async function holeLuecken(endkundeId: string): Promise<string[] | undefined> {
      const response = await request(testApp.httpServer)
        .get('/monitoring/vollstaendigkeit')
        .query({ endkundeId, nurMitLuecken: 'true' })
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(response.status).toBe(200);
      const daten = (response.body as { daten: Array<{ endkundeId: string; luecken: string[] }> }).daten;
      return daten.find((zeile) => zeile.endkundeId === endkundeId)?.luecken;
    }

    it('liefert die STRUKTURELLEN Luecken eines frisch angelegten Endkunden — aber KEINE Einwilligungs-Luecke', async () => {
      // **Der Fehler, den dieser Test festhaelt.** Die Pruefung las
      // `energy.endkunde.consent_status` — einen Slot aus V0002, den V0044
      // abgeloest hat und den seither NIEMAND mehr fuellt. Er steht bei jedem
      // Endkunden dauerhaft auf `fehlt`, also meldete die Arbeitsplatz-Kachel
      // bei JEDEM Kunden „Keine aktive Einwilligung" — unbehebbar, denn es gab
      // keine Eingabe, die den Befund je aufgeloest haette.
      //
      // Fachlich ist er ausserdem falsch: Fuer den ENDKUNDEN beruht die
      // Messdatenverarbeitung laut Matrix (V0047) auf Art. 6 Abs. 1 lit. b.
      // Da ist keine Einwilligung zu holen, und ihr Fehlen ist keine Luecke.
      const { id: endkundeId } = await legeEndkundeAn('Alpha');

      const luecken = await holeLuecken(endkundeId);

      expect(luecken).toEqual(expect.arrayContaining(['kein_messkonzept', 'kein_zaehler', 'kein_messkanal']));
      expect(luecken).not.toContain('kein_aktiver_consent');
    });

    it('meldet die Einwilligungs-Luecke dort, wo sie fachlich besteht: bei einem Anschlussnutzer ohne Einwilligung', async () => {
      // Der Anschlussnutzer ist NICHT Vertragspartei — fuer ihn ist die
      // Einwilligung die Grundlage (lit. a). Fehlt sie, darf sein Verbrauch
      // nicht verarbeitet werden. GENAU das soll die Kachel zeigen.
      const { id: endkundeId } = await legeEndkundeAn('AnschlussOhneConsent');

      const ohneAnschlussnutzer = await holeLuecken(endkundeId);
      expect(ohneAnschlussnutzer).not.toContain('kein_aktiver_consent');

      const anschlussnutzer = await request(testApp.httpServer)
        .post('/stammdaten/anschlussnutzer')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ endkundeId, stammdatenPii: { name: 'Testnutzer Musterperson' } });
      expect(anschlussnutzer.status, JSON.stringify(anschlussnutzer.body)).toBe(201);

      expect(await holeLuecken(endkundeId)).toContain('kein_aktiver_consent');
    });

    it('die Antwort enthaelt AUSSCHLIESSLICH Metadaten — KEIN PII-Feld (kein Testkunde-Name/-Anschrift), KEIN Verbrauchsfeld', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Beta');

      const response = await request(testApp.httpServer)
        .get('/monitoring/vollstaendigkeit')
        .query({ endkundeId, nurMitLuecken: 'true' })
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('Testkunde');
      expect(serialized).not.toContain('Musterstraße');
      expect(serialized).not.toContain('wert');
      expect(serialized).not.toContain('verbrauch');

      const daten = (response.body as { daten: Array<Record<string, unknown>> }).daten;
      const eintrag = daten.find((zeile) => zeile['endkundeId'] === endkundeId);
      expect(eintrag).toBeDefined();
      expect(Object.keys(eintrag as object).sort()).toEqual(
        ['endkundeId', 'ebene', 'geprueftAm', 'luecken', 'systemId', 'zaehlerId'].sort(),
      );
    });

    it('lehnt ab (400) bei einer ungueltigen endkundeId (kein UUID-Format, Contract-Validierung)', async () => {
      const response = await request(testApp.httpServer)
        .get('/monitoring/vollstaendigkeit')
        .query({ endkundeId: 'keine-uuid' })
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
    });

    it('nurMitLuecken=false liefert auch Endkunden ohne Luecken (Filter deaktiviert)', async () => {
      const { id: endkundeId } = await legeEndkundeAn('Gamma');

      const response = await request(testApp.httpServer)
        .get('/monitoring/vollstaendigkeit')
        .query({ endkundeId, nurMitLuecken: 'false' })
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const daten = (response.body as { daten: Array<{ endkundeId: string }> }).daten;
      expect(daten.some((zeile) => zeile.endkundeId === endkundeId)).toBe(true);
    });
  });

  describe('M1 — Rolle × Route-Matrix (Monitoring, REIN lesend in v1)', () => {
    it('anonym (kein Token) -> 401 auf GET /monitoring/vollstaendigkeit', async () => {
      const response = await request(testApp.httpServer).get('/monitoring/vollstaendigkeit');
      expect(response.status).toBe(401);
    });

    it('admin -> 403 auf GET /monitoring/vollstaendigkeit (admin ist KEINE Stammdaten-Rolle)', async () => {
      const response = await request(testApp.httpServer)
        .get('/monitoring/vollstaendigkeit')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 200 auf GET /monitoring/vollstaendigkeit', async () => {
      const response = await request(testApp.httpServer)
        .get('/monitoring/vollstaendigkeit')
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(200);
    });

    it('betrieb -> 200 auf GET /monitoring/vollstaendigkeit (Referenz-Happy-Path)', async () => {
      const response = await request(testApp.httpServer)
        .get('/monitoring/vollstaendigkeit')
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(response.status).toBe(200);
    });
  });
});
