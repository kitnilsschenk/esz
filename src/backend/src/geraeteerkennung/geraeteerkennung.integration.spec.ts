import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { idempotencyKey, legeEndkundeAn, legeSystemAn } from '../nachweis/test-support/nachweis-test-fixtures';
import { GERAETEERKENNUNG_EVENT_CODES } from './audit/geraeteerkennung-audit-events';

/**
 * Integrationstests (ECHTER Postgres-Testcontainer, ALLE `migrations/**`
 * inkl. V0056/V0057) für `/geraeteerkennung/*` (TB-05, [Q3] Kap. 5).
 *
 * **Was hier NICHT getestet wird und warum.** Die Zuordnungsquote selbst
 * braucht Tageswerte in `measurement.messwert_tag` und damit einen
 * Verdichtungslauf als Fixture — sie hat ihren eigenen Test verdient, nicht
 * einen Anhang an diesen. Geprüft ist hier alles, was OHNE Messwerte
 * belastbar ist: die Vorgänge, die die Quote überhaupt erst bewegen, ihre
 * Constraints und ihre Pflichtereignisse.
 */
describe('Geraeteerkennung — Integrationstests (TB-05)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let auditorToken: string;
  let dbClient: Client;
  let endkundeId: string;
  let systemId: string;

  async function legeMesskanalAn(): Promise<string> {
    const zaehler = await request(testApp.httpServer)
      .post('/stammdaten/zaehler')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ systemId, geraetetyp: 'Testzaehler', energietraeger: 'strom' });
    expect(zaehler.status).toBe(201);
    const zaehlerId = (zaehler.body as { id: string }).id;

    const kanal = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ messgroesse: 'Wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
    expect(kanal.status).toBe(201);
    return (kanal.body as { id: string }).id;
  }

  async function legeGruppeAn(bezeichnung: string): Promise<string> {
    const response = await request(testApp.httpServer)
      .post('/geraeteerkennung/gruppen')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ endkundeId, bezeichnung });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  function zuordne(body: Record<string, unknown>): request.Test {
    return request(testApp.httpServer)
      .post('/geraeteerkennung/zuordnungen')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(body);
  }

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-sub', ['compliance-auditor']);
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
    endkundeId = await legeEndkundeAn(testApp, betriebToken, `GE-${randomUUID().slice(0, 8)}`);
    systemId = await legeSystemAn(testApp, betriebToken, endkundeId, 'Testsystem Geraeteerkennung');
  }, 180_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  describe('Zuordnen', () => {
    it('legt eine Zuordnung an, gibt sie zurueck und protokolliert sie ohne Endkunden-Bezug', async () => {
      const geraetegruppeId = await legeGruppeAn('Beleuchtung');
      const messkanalId = await legeMesskanalAn();

      const angelegt = await zuordne({
        geraetegruppeId,
        messkanalId,
        methode: 'direktmessung',
        gueltigVon: '2026-01-01',
      });
      expect(angelegt.status).toBe(201);
      expect(angelegt.body).toMatchObject({
        geraetegruppeId,
        messkanalId,
        methode: 'direktmessung',
        genauigkeitPct: null,
        anteilProzent: 100,
        gueltigBis: null,
        wirksam: true,
        // ABGELEITET aus `energy.messkanal.ist_untermessung` (V0058) — der
        // Testkanal ist als Hauptmessung angelegt. Die Zuordnung nimmt die
        // Angabe nicht mehr entgegen.
        imGesamtverbrauchEnthalten: false,
      });

      const gelesen = await request(testApp.httpServer)
        .get('/geraeteerkennung/zuordnungen')
        .query({ endkundeId })
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(gelesen.status).toBe(200);
      expect((gelesen.body as { messkanalId: string }[]).some((z) => z.messkanalId === messkanalId)).toBe(true);

      // `objekt_ref` ist die GRUPPE, nicht der Kanal: Was sich aendert, ist
      // die Zusammensetzung der Gruppe, und danach wird spaeter gesucht.
      const auditRows = await dbClient.query(
        `SELECT kontext FROM audit.event
          WHERE event_typ = $1 AND objekt_ref = $2`,
        [GERAETEERKENNUNG_EVENT_CODES.ZUORDNUNG_ANGELEGT, geraetegruppeId],
      );
      expect(auditRows.rowCount).toBe(1);
      const kontext = (auditRows.rows[0] as { kontext: Record<string, unknown> }).kontext;
      expect(kontext['methode']).toBe('direktmessung');
      // Der Kontext traegt die Methode, aber KEINE Endkunden-Kennung und
      // keinen Verbrauchswert.
      expect(Object.keys(kontext)).not.toContain('endkunde_id');
    });

    it('lehnt eine Schaetzung ohne Genauigkeitsangabe ab (400)', async () => {
      // [Q3] Kap. 5 verlangt die Angabe ausdruecklich. Ohne sie ist eine
      // geschaetzte Zuordnung von einer gemessenen nicht zu unterscheiden.
      const geraetegruppeId = await legeGruppeAn('Lueftung');
      const messkanalId = await legeMesskanalAn();

      const response = await zuordne({
        geraetegruppeId,
        messkanalId,
        methode: 'algorithmus',
        gueltigVon: '2026-01-01',
      });

      expect(response.status).toBe(400);
    });

    it('laesst denselben Kanal nicht zweimal gleichzeitig zuordnen (409)', async () => {
      // Ohne den Exclusion-Constraint aus V0056 ginge der Verbrauch doppelt in
      // den Zaehler der Quote — eine Zuordnungsquote von 140 % waere
      // schreibbar.
      const ersteGruppe = await legeGruppeAn('Kaelte A');
      const zweiteGruppe = await legeGruppeAn('Kaelte B');
      const messkanalId = await legeMesskanalAn();

      const erste = await zuordne({
        geraetegruppeId: ersteGruppe,
        messkanalId,
        methode: 'direktmessung',
        gueltigVon: '2026-01-01',
      });
      expect(erste.status).toBe(201);

      const zweite = await zuordne({
        geraetegruppeId: zweiteGruppe,
        messkanalId,
        methode: 'direktmessung',
        gueltigVon: '2026-06-01',
      });

      expect(zweite.status).toBe(409);
    });
  });

  describe('Beenden', () => {
    it('beendet eine Zuordnung mit Grund und laesst sie als beendet stehen', async () => {
      const geraetegruppeId = await legeGruppeAn('Waermepumpe');
      const messkanalId = await legeMesskanalAn();
      expect(
        (
          await zuordne({
            geraetegruppeId,
            messkanalId,
            methode: 'direktmessung',
            gueltigVon: '2026-01-01',
          })
        ).status,
      ).toBe(201);

      const beendet = await request(testApp.httpServer)
        .post('/geraeteerkennung/zuordnungen/beenden')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ geraetegruppeId, messkanalId, gueltigBis: '2026-07-01', grund: 'Zaehler umgeklemmt' });

      expect(beendet.status).toBe(200);
      expect(beendet.body).toMatchObject({
        gueltigBis: '2026-07-01',
        beendetGrund: 'Zaehler umgeklemmt',
        wirksam: false,
      });

      // Sie verschwindet NICHT: Sie belegt den Zeitraum, in dem sie galt, und
      // damit die Quote der Vergangenheit.
      const gelesen = await request(testApp.httpServer)
        .get('/geraeteerkennung/zuordnungen')
        .query({ endkundeId })
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(
        (gelesen.body as { messkanalId: string; wirksam: boolean }[]).find((z) => z.messkanalId === messkanalId)
          ?.wirksam,
      ).toBe(false);
    });

    it('lehnt das Beenden ohne Grund ab (400)', async () => {
      const geraetegruppeId = await legeGruppeAn('Druckluft');
      const messkanalId = await legeMesskanalAn();
      expect(
        (
          await zuordne({
            geraetegruppeId,
            messkanalId,
            methode: 'direktmessung',
            gueltigVon: '2026-01-01',
          })
        ).status,
      ).toBe(201);

      const response = await request(testApp.httpServer)
        .post('/geraeteerkennung/zuordnungen/beenden')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ geraetegruppeId, messkanalId, gueltigBis: '2026-07-01' });

      expect(response.status).toBe(400);
    });
  });

  describe('Entbehrlichkeit', () => {
    it('vermerkt sie mit Begruendung und gibt sie danach zurueck', async () => {
      // Ohne die Lese-Route waere das Vermerken schreib-only: Die
      // Betriebssicht koennte ein Haekchen setzen, aber nicht zeigen, ob schon
      // eines gesetzt IST.
      const eigenesSystem = await legeSystemAn(testApp, betriebToken, endkundeId, 'System mit einem Geraet');

      const vorher = await request(testApp.httpServer)
        .get(`/geraeteerkennung/systeme/${eigenesSystem}/entbehrlich`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(vorher.status).toBe(200);
      expect(vorher.body).toEqual({ systemId: eigenesSystem, entbehrlich: false, grund: null });

      const vermerkt = await request(testApp.httpServer)
        .post(`/geraeteerkennung/systeme/${eigenesSystem}/entbehrlich`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ entbehrlich: true, grund: 'System umfasst nur ein Geraet.' });
      expect(vermerkt.status).toBe(204);

      const nachher = await request(testApp.httpServer)
        .get(`/geraeteerkennung/systeme/${eigenesSystem}/entbehrlich`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(nachher.body).toEqual({
        systemId: eigenesSystem,
        entbehrlich: true,
        grund: 'System umfasst nur ein Geraet.',
      });

      const auditRows = await dbClient.query(
        `SELECT kontext FROM audit.event WHERE event_typ = $1 AND objekt_ref = $2`,
        [GERAETEERKENNUNG_EVENT_CODES.ENTBEHRLICH, eigenesSystem],
      );
      expect(auditRows.rowCount).toBe(1);
      const kontext = (auditRows.rows[0] as { kontext: Record<string, unknown> }).kontext;
      expect(kontext['entbehrlich']).toBe(true);
      // Der Freitext-Grund gehoert NICHT ins Audit-Log — er koennte einen
      // Namen tragen und liegt ueber `objekt_ref` ohnehin auffindbar in
      // `energy.system`.
      expect(Object.keys(kontext)).not.toContain('grund');
    });

    it('lehnt die Feststellung ohne Begruendung ab (400)', async () => {
      const eigenesSystem = await legeSystemAn(testApp, betriebToken, endkundeId, 'System ohne Begruendung');

      const response = await request(testApp.httpServer)
        .post(`/geraeteerkennung/systeme/${eigenesSystem}/entbehrlich`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ entbehrlich: true });

      expect(response.status).toBe(400);
      const stand = await request(testApp.httpServer)
        .get(`/geraeteerkennung/systeme/${eigenesSystem}/entbehrlich`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect((stand.body as { entbehrlich: boolean }).entbehrlich).toBe(false);
    });

    it('nimmt die Feststellung ohne Begruendung zurueck', async () => {
      // Wer den Vermerk entfernt, stellt den Normalfall wieder her. Dafuer
      // eine Erklaerung zu verlangen, hielte Leute davon ab, einen Fehler zu
      // korrigieren.
      const eigenesSystem = await legeSystemAn(testApp, betriebToken, endkundeId, 'System Ruecknahme');
      await request(testApp.httpServer)
        .post(`/geraeteerkennung/systeme/${eigenesSystem}/entbehrlich`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ entbehrlich: true, grund: 'Zunaechst nur ein Geraet.' });

      const zurueck = await request(testApp.httpServer)
        .post(`/geraeteerkennung/systeme/${eigenesSystem}/entbehrlich`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ entbehrlich: false });
      expect(zurueck.status).toBe(204);

      const stand = await request(testApp.httpServer)
        .get(`/geraeteerkennung/systeme/${eigenesSystem}/entbehrlich`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(stand.body).toEqual({ systemId: eigenesSystem, entbehrlich: false, grund: null });
    });

    it('laesst den Auditor NICHT vermerken (403)', async () => {
      // Wer die Quote pruefen soll, darf sie nicht selbst fuer erfuellt
      // erklaeren.
      const response = await request(testApp.httpServer)
        .post(`/geraeteerkennung/systeme/${systemId}/entbehrlich`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ entbehrlich: true, grund: 'Versuch des Auditors' });

      expect(response.status).toBe(403);
    });

    it('meldet ein unbekanntes System als nicht gefunden (404)', async () => {
      const response = await request(testApp.httpServer)
        .get(`/geraeteerkennung/systeme/${randomUUID()}/entbehrlich`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(404);
    });
  });
});
