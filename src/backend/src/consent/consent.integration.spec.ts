import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import {
  idempotencyKey,
  legeAnschlussnutzerAn,
  legeEndkundeAn,
  legeNutzungsverhaeltnisAn,
  legeSystemAn,
} from '../nachweis/test-support/nachweis-test-fixtures';

/**
 * Einwilligung und Widerspruch gegen eine ECHTE Datenbank (ADR-0012, AW-27).
 *
 * **Warum dieser Test existiert.** Zwei Vorgänge dieses Moduls waren
 * ÜBERHAUPT NICHT AUSFÜHRBAR, und beide sind Betroffenenrechte:
 *
 * - Der WIDERRUF einer Einwilligung meldete jedes Mal „bereits widerrufen".
 *   Art. 7 Abs. 3 DSGVO verlangt, dass der Widerruf so einfach ist wie die
 *   Erteilung — er war gar nicht möglich.
 * - Die RÜCKNAHME eines Widerspruchs meldete jedes Mal „bereits
 *   zurückgenommen". Ein Endkunde, der der monatlichen Nutzerinformation
 *   widersprochen hatte, konnte sie nie wieder bekommen.
 *
 * Beide Male dieselbe Ursache: `bindRows` statt `bindReturningRows` bei einem
 * `UPDATE ... RETURNING` (s. `map-row.ts`). TypeORM liefert dort ein Tupel
 * [rows, rowCount]; der Test auf „genau eine Zeile" war damit strukturell
 * immer falsch. Ein Unit-Test mit Repository-Mock kann das nicht sehen — er
 * lässt den Mock `true` zurückgeben und prüft, was der Service daraus macht.
 *
 * Deshalb hat das Modul jetzt einen Integrationstest, und dieser Kopf hält
 * fest, wonach zuerst zu sehen ist, wenn er wieder rot wird.
 */
describe('Einwilligung & Widerspruch — Integrationstests (ADR-0012, AW-27)', () => {
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
  }, 180_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  let fassungsZaehler = 0;

  /**
   * Veröffentlicht eine Fassung für `zweckCode` — jede mit eigener Nummer.
   *
   * Liefert `gueltigAb` zurück, weil der Erklärungszeitpunkt IN die Fassung
   * fallen muss: Zugestimmt wurde dem Wortlaut, der damals galt. Ein
   * Erteilungsdatum vor der Veröffentlichung findet keine Fassung — richtig
   * so, aber im Test leicht zu übersehen.
   */
  async function veroeffentlicheText(zweckCode: string): Promise<string> {
    fassungsZaehler += 1;
    const response = await request(testApp.httpServer)
      .post('/consent/texte')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        zweckCode,
        fassung: `1.${String(fassungsZaehler)}`,
        wortlaut:
          'Ich willige in die beschriebene Verarbeitung ein. Diese Erklaerung kann ich jederzeit ' +
          'mit Wirkung fuer die Zukunft widerrufen.',
      });
    expect(response.status).toBe(201);
    return (response.body as { gueltigAb: string }).gueltigAb;
  }

  function erteile(endkundeId: string, zweckCode: string, erteiltAt: string): request.Test {
    return request(testApp.httpServer)
      .post('/consent/einwilligungen')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        subjektTyp: 'endkunde',
        subjektId: endkundeId,
        zweckCode,
        erfassungsweg: 'vertrag_schriftlich',
        erteiltAt,
        quelleRef: `AZ-TEST-${randomUUID().slice(0, 8)}`,
      });
  }

  describe('Der Widerruf einer Einwilligung (Art. 7 Abs. 3 DSGVO)', () => {
    it('ist moeglich — und traegt den erklaerten Zeitpunkt, nicht den der Erfassung', async () => {
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, `CS-W-${randomUUID().slice(0, 8)}`);
      const gueltigAb = await veroeffentlicheText('mehrwertdienste');
      const erteilt = await erteile(endkundeId, 'mehrwertdienste', gueltigAb);
      expect(erteilt.status).toBe(201);
      const einwilligungId = (erteilt.body as { id: string }).id;
      // BEWUSST `gueltigAb` und kein `new Date()`: Die Constraint aus V0046
      // (`widerrufen_at <= updated_at`) vergleicht gegen `now()` in Postgres,
      // also die TRANSAKTIONS-Startzeit. Ein im Test gebildetes „jetzt" liegt
      // danach und faellt durch — `gueltigAb` stammt aus einer FRUEHEREN
      // Transaktion und liegt damit garantiert davor.
      const widerrufenAt = gueltigAb;

      const widerrufen = await request(testApp.httpServer)
        .post(`/consent/einwilligungen/${einwilligungId}/widerruf`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ widerrufenAt, erfassungsweg: 'vertrag_schriftlich', quelleRef: 'AZ-TEST-WIDERRUF-1' });

      expect(widerrufen.status).toBe(200);
      expect((widerrufen.body as { widerrufenAt: string | null }).widerrufenAt).toBe(widerrufenAt);

      const stand = await request(testApp.httpServer)
        .get('/consent/einwilligungen')
        .query({ subjektTyp: 'endkunde', subjektId: endkundeId })
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(stand.status).toBe(200);
      const zweck = (
        stand.body as {
          zwecke: { zweckCode: string; wirksameEinwilligung: unknown; verlauf: unknown[] }[];
        }
      ).zwecke.find((eintrag) => eintrag.zweckCode === 'mehrwertdienste');
      // Nach dem Widerruf gibt es KEINE wirksame Einwilligung mehr — der
      // Verlauf traegt sie aber weiter. Er ist der Nachweis nach Art. 7 Abs. 1;
      // eine Einwilligung, die nach dem Widerruf verschwindet, koennte
      // niemand mehr belegen.
      expect(zweck?.wirksameEinwilligung).toBeNull();
      expect(zweck?.verlauf).toHaveLength(1);
    });

    it('laesst einen ZWEITEN Widerruf den ersten Zeitpunkt nicht ueberschreiben', async () => {
      // Sonst verschoebe sich die Aussage, ab wann die Verarbeitung ohne
      // Grundlage lief — zugunsten des Verantwortlichen.
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, `CS-W2-${randomUUID().slice(0, 8)}`);
      const gueltigAb = await veroeffentlicheText('mehrwertdienste');
      const erteilt = await erteile(endkundeId, 'mehrwertdienste', gueltigAb);
      expect(erteilt.status).toBe(201);
      const einwilligungId = (erteilt.body as { id: string }).id;
      const ersterZeitpunkt = gueltigAb;

      const ersterWiderruf = await request(testApp.httpServer)
        .post(`/consent/einwilligungen/${einwilligungId}/widerruf`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          widerrufenAt: ersterZeitpunkt,
          erfassungsweg: 'vertrag_schriftlich',
          quelleRef: 'AZ-TEST-WIDERRUF-2a',
        });
      expect(ersterWiderruf.status).toBe(200);

      const zweiterWiderruf = await request(testApp.httpServer)
        .post(`/consent/einwilligungen/${einwilligungId}/widerruf`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          widerrufenAt: gueltigAb,
          erfassungsweg: 'vertrag_schriftlich',
          quelleRef: 'AZ-TEST-WIDERRUF-2b',
        });
      expect(zweiterWiderruf.status).toBe(409);

      const zeile = await dbClient.query(
        'SELECT widerrufen_at FROM consent.einwilligung WHERE id = $1',
        [einwilligungId],
      );
      expect((zeile.rows[0] as { widerrufen_at: Date }).widerrufen_at.toISOString()).toBe(ersterZeitpunkt);
    });

    it('weist einen Widerruf VOR der Erteilung ab', async () => {
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, `CS-W3-${randomUUID().slice(0, 8)}`);
      const gueltigAb = await veroeffentlicheText('mehrwertdienste');
      const erteilt = await erteile(endkundeId, 'mehrwertdienste', gueltigAb);
      expect(erteilt.status).toBe(201);
      const vorDerErteilung = new Date(Date.parse(gueltigAb) - 3_600_000).toISOString();

      const response = await request(testApp.httpServer)
        .post(`/consent/einwilligungen/${(erteilt.body as { id: string }).id}/widerruf`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          widerrufenAt: vorDerErteilung,
          erfassungsweg: 'vertrag_schriftlich',
          quelleRef: 'AZ-TEST-WIDERRUF-3',
        });

      expect(response.status).toBe(400);
    });
  });

  // ------------------------------------------------------------------
  // Auflage C-10 (ADR-0012 Stufe C) — die WIRKUNG des Widerrufs.
  //
  // Bis V0089 protokollierte das System, DASS widerrufen wurde. Die Frage,
  // die die betroffene Person mit dem Widerruf eigentlich stellt — hoert die
  // Messung jetzt auf? — beantwortete niemand, und sie war hinterher auch
  // nicht mehr rekonstruierbar.
  //
  // Der Aufbau nutzt den ANSCHLUSSNUTZER als Subjekt, weil die Matrix fuer
  // ihn `opt_in` fuehrt (fuer den Endkunden `vertraglich`, dort hat ein
  // Widerruf per Definition keine Wirkung auf das Gate).
  // ------------------------------------------------------------------
  describe('Auflage C-10 — die Wirkung eines Widerrufs auf die Messung', () => {
    /**
     * Endkunde, System, Zaehler, Anschlussnutzer und aktives
     * Nutzungsverhaeltnis.
     *
     * Personen ueber den HTTP-Pfad, nicht per SQL: eine Einwilligung
     * verlangt einen Stammdatensatz mit Subjekt-Schluessel
     * (`identity.*_pii`) — eine blosse `energy.*`-Zeile laesst
     * `POST /consent/einwilligungen` mit 404 scheitern, und zwar zu Recht.
     * Der Zaehler dagegen hat keinen Schreibpfad ueber die API und wird
     * direkt angelegt.
     */
    async function baueMessstrecke(): Promise<{ anschlussnutzerId: string; zaehlerId: string }> {
      const suffix = randomUUID().slice(0, 8);
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, `C10-${suffix}`);
      const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, `C10-System-${suffix}`);
      const anschlussnutzerId = await legeAnschlussnutzerAn(testApp, betriebToken, endkundeId, `C10-${suffix}`);
      await legeNutzungsverhaeltnisAn(testApp, betriebToken, {
        endkundeId,
        anschlussnutzerId,
        systemId,
        gueltigVon: new Date(Date.now() - 86_400_000).toISOString(),
      });

      const zaehlerId = randomUUID();
      await dbClient.query(
        `INSERT INTO energy.zaehler (id, system_id, geraetetyp, energietraeger)
         VALUES ($1, $2, 'synthetisch_referenz_v1', 'strom')`,
        [zaehlerId, systemId],
      );

      return { anschlussnutzerId, zaehlerId };
    }

    function erteileAnschlussnutzer(anschlussnutzerId: string, erteiltAt: string): request.Test {
      return request(testApp.httpServer)
        .post('/consent/einwilligungen')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          subjektTyp: 'anschlussnutzer',
          subjektId: anschlussnutzerId,
          zweckCode: 'messdaten_verarbeitung',
          erfassungsweg: 'vertrag_schriftlich',
          erteiltAt,
          quelleRef: `AZ-TEST-${randomUUID().slice(0, 8)}`,
        });
    }

    it('meldet den gestoppten Zaehler — und protokolliert die Zahl im Audit-Ereignis (V0089)', async () => {
      const { anschlussnutzerId, zaehlerId } = await baueMessstrecke();
      const gueltigAb = await veroeffentlicheText('messdaten_verarbeitung');

      const erteilt = await erteileAnschlussnutzer(anschlussnutzerId, gueltigAb);
      expect(erteilt.status).toBe(201);
      const einwilligungId = (erteilt.body as { id: string }).id;

      // Vorbedingung: MIT Einwilligung traegt das Gate.
      const vorher = await dbClient.query<{ wirksam: boolean }>(
        'SELECT consent.ingest_rechtsgrundlage_wirksam($1) AS wirksam',
        [zaehlerId],
      );
      expect(vorher.rows[0]?.wirksam).toBe(true);

      const widerrufen = await request(testApp.httpServer)
        .post(`/consent/einwilligungen/${einwilligungId}/widerruf`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ widerrufenAt: gueltigAb, erfassungsweg: 'vertrag_schriftlich', quelleRef: 'AZ-TEST-C10' });

      expect(widerrufen.status).toBe(200);
      expect((widerrufen.body as { wirkung: { zaehlerGestoppt: number; zaehlerOhneGrundlage: number } }).wirkung).toEqual(
        { zaehlerGestoppt: 1, zaehlerOhneGrundlage: 1 },
      );

      // Und die Wirkung ist real, nicht nur gemeldet.
      const nachher = await dbClient.query<{ wirksam: boolean }>(
        'SELECT consent.ingest_rechtsgrundlage_wirksam($1) AS wirksam',
        [zaehlerId],
      );
      expect(nachher.rows[0]?.wirksam).toBe(false);

      const ereignis = await dbClient.query<{ kontext: Record<string, unknown> }>(
        "SELECT kontext FROM audit.event WHERE event_typ = 'einwilligung.consent.widerrufen' AND objekt_ref = $1",
        [einwilligungId],
      );
      expect(ereignis.rowCount).toBe(1);
      const kontext = ereignis.rows[0]?.kontext ?? {};
      expect(kontext['zaehler_gestoppt']).toBe('1');
      expect(kontext['zaehler_ohne_grundlage']).toBe('1');
    });

    it('meldet 0 gestoppte Zaehler, wenn der Widerruf nichts aendert — aber nennt den Gesamtstand dazu', async () => {
      // Zweiter Anschlussnutzer am selben System waere der interessantere
      // Fall; hier genuegt der einfachste: ein Zweck OHNE Bezug zur Messung.
      // Sein Widerruf laesst das Gate unberuehrt, und genau das soll die
      // Zahl aussagen -- nicht „keine Angabe".
      const { anschlussnutzerId } = await baueMessstrecke();
      const messGueltigAb = await veroeffentlicheText('messdaten_verarbeitung');
      expect((await erteileAnschlussnutzer(anschlussnutzerId, messGueltigAb)).status).toBe(201);

      const mwGueltigAb = await veroeffentlicheText('mehrwertdienste');
      const mehrwert = await request(testApp.httpServer)
        .post('/consent/einwilligungen')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          subjektTyp: 'anschlussnutzer',
          subjektId: anschlussnutzerId,
          zweckCode: 'mehrwertdienste',
          erfassungsweg: 'vertrag_schriftlich',
          erteiltAt: mwGueltigAb,
          quelleRef: `AZ-TEST-${randomUUID().slice(0, 8)}`,
        });
      expect(mehrwert.status).toBe(201);

      const widerrufen = await request(testApp.httpServer)
        .post(`/consent/einwilligungen/${(mehrwert.body as { id: string }).id}/widerruf`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ widerrufenAt: mwGueltigAb, erfassungsweg: 'vertrag_schriftlich', quelleRef: 'AZ-TEST-C10b' });

      expect(widerrufen.status).toBe(200);
      expect((widerrufen.body as { wirkung: { zaehlerGestoppt: number; zaehlerOhneGrundlage: number } }).wirkung).toEqual(
        { zaehlerGestoppt: 0, zaehlerOhneGrundlage: 0 },
      );
    });
  });

  describe('Widerspruch und seine Ruecknahme (AW-27)', () => {
    async function widersprich(endkundeId: string, zweckCode: string): Promise<string> {
      const response = await request(testApp.httpServer)
        .post('/consent/widersprueche')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          subjektTyp: 'endkunde',
          subjektId: endkundeId,
          zweckCode,
          erfassungsweg: 'vertrag_schriftlich',
          erklaertAt: '2026-02-01T10:00:00.000Z',
          quelleRef: `AZ-TEST-WS-${randomUUID().slice(0, 8)}`,
        });
      expect(response.status).toBe(201);
      return (response.body as { id: string }).id;
    }

    it('nimmt einen Widerspruch zurueck — der Endkunde bekommt die Information wieder', async () => {
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, `CS-R-${randomUUID().slice(0, 8)}`);
      const widerspruchId = await widersprich(endkundeId, 'nutzerinformation');

      const zurueck = await request(testApp.httpServer)
        .post(`/consent/widersprueche/${widerspruchId}/ruecknahme`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          zurueckgenommenAt: '2026-05-01T10:00:00.000Z',
          erfassungsweg: 'vertrag_schriftlich',
          quelleRef: 'AZ-TEST-RUECKNAHME-1',
        });

      expect(zurueck.status).toBe(200);
      expect((zurueck.body as { zurueckgenommenAt: string | null }).zurueckgenommenAt).toBe(
        '2026-05-01T10:00:00.000Z',
      );

      const liste = await request(testApp.httpServer)
        .get('/consent/widersprueche')
        .query({ subjektTyp: 'endkunde', subjektId: endkundeId })
        .set('Authorization', `Bearer ${auditorToken}`);
      const eintrag = (liste.body as { id: string; wirksam: boolean }[]).find((w) => w.id === widerspruchId);
      // Der Widerspruch VERSCHWINDET nicht: Er belegt den Zeitraum, in dem
      // nicht informiert werden durfte.
      expect(eintrag).toBeDefined();
      expect(eintrag?.wirksam).toBe(false);
    });

    it('laesst eine ZWEITE Ruecknahme den ersten Zeitpunkt nicht ueberschreiben', async () => {
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, `CS-R2-${randomUUID().slice(0, 8)}`);
      const widerspruchId = await widersprich(endkundeId, 'nutzerinformation');
      expect(
        (
          await request(testApp.httpServer)
            .post(`/consent/widersprueche/${widerspruchId}/ruecknahme`)
            .set('Authorization', `Bearer ${betriebToken}`)
            .set('Idempotency-Key', idempotencyKey())
            .send({
              zurueckgenommenAt: '2026-05-01T10:00:00.000Z',
              erfassungsweg: 'vertrag_schriftlich',
              quelleRef: 'AZ-TEST-RUECKNAHME-2a',
            })
        ).status,
      ).toBe(200);

      const zweite = await request(testApp.httpServer)
        .post(`/consent/widersprueche/${widerspruchId}/ruecknahme`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          zurueckgenommenAt: '2026-06-01T10:00:00.000Z',
          erfassungsweg: 'vertrag_schriftlich',
          quelleRef: 'AZ-TEST-RUECKNAHME-2b',
        });

      expect(zweite.status).toBe(409);

      const zeile = await dbClient.query(
        'SELECT zurueckgenommen_at FROM consent.widerspruch WHERE id = $1',
        [widerspruchId],
      );
      expect((zeile.rows[0] as { zurueckgenommen_at: Date }).zurueckgenommen_at.toISOString()).toBe(
        '2026-05-01T10:00:00.000Z',
      );
    });

    it('weist einen Widerspruch gegen einen OPT-IN-Zweck ab — dort wird widerrufen', async () => {
      // „Gegen etwas, das nur mit Einwilligung laeuft, widerspricht man nicht
      // — man widerruft." Wer beides vermischt, schreibt dem Betroffenen mal
      // ein Recht zu, das er nicht hat, und verschweigt mal eines, das er hat.
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, `CS-OI-${randomUUID().slice(0, 8)}`);

      const response = await request(testApp.httpServer)
        .post('/consent/widersprueche')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          subjektTyp: 'endkunde',
          subjektId: endkundeId,
          zweckCode: 'mehrwertdienste',
          erfassungsweg: 'vertrag_schriftlich',
          erklaertAt: '2026-02-01T10:00:00.000Z',
          quelleRef: 'AZ-TEST-WS-OPTIN',
        });

      expect(response.status).toBe(400);
    });

    it('laesst einen ZWEITEN wirksamen Widerspruch zur selben Sache nicht zu', async () => {
      // Zwei Erklaerungszeitpunkte zur selben Sache, und welcher gilt, koennte
      // niemand mehr sagen.
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, `CS-WS2-${randomUUID().slice(0, 8)}`);
      await widersprich(endkundeId, 'nutzerinformation');

      const zweiter = await request(testApp.httpServer)
        .post('/consent/widersprueche')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          subjektTyp: 'endkunde',
          subjektId: endkundeId,
          zweckCode: 'nutzerinformation',
          erfassungsweg: 'vertrag_schriftlich',
          erklaertAt: '2026-03-01T10:00:00.000Z',
          quelleRef: 'AZ-TEST-WS-DOPPELT',
        });

      expect(zweiter.status).toBe(409);
    });
  });

  /**
   * BEFUND, NICHT BEHOBEN — er ist eine fachliche Entscheidung, keine
   * Reparatur: `WiderspruchRepository.setzeWissAuswertungAusgenommen()` ist
   * die einzige Stelle im Code, die das DE-04-Ausnahme-Merkmal
   * `von_wiss_auswertung_ausgenommen` schreibt. Erreichbar ist sie
   * AUSSCHLIESSLICH über einen Widerspruch gegen `wiss_auswertung` — die
   * Matrix aus V0047 führt diesen Zweck aber für BEIDE Subjektarten als
   * `opt_in`, und `WiderspruchService` weist einen Widerspruch gegen einen
   * Opt-in-Zweck zu Recht ab (s. Test oben). Der Schreibpfad ist damit tot:
   * Das Merkmal kann über das System nicht mehr gesetzt werden, seit der
   * frühere Weg (ein Feld im Endkunden-Formular) mit AW-27 entfallen ist.
   *
   * Zu entscheiden ist, WELCHER Vorgang das Merkmal künftig setzt — der
   * WIDERRUF der Einwilligung zu `wiss_auswertung` (dann gehört die Wirkung
   * in `EinwilligungService.widerrufe`) oder eine Änderung der Matrix. Beides
   * berührt DE-04 und gehört vor `compliance-director`, nicht in einen
   * Testlauf.
   */

  describe('Der Stand eines Subjekts (Art. 15 DSGVO)', () => {
    it('nennt AUCH die Zwecke, zu denen nie eingewilligt wurde', async () => {
      // Eine Liste, die nur Erteiltes zeigt, sagt nichts ueber das
      // Nicht-Erteilte — und genau danach wird bei einer Auskunft gefragt.
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, `CS-S-${randomUUID().slice(0, 8)}`);

      const response = await request(testApp.httpServer)
        .get('/consent/einwilligungen')
        .query({ subjektTyp: 'endkunde', subjektId: endkundeId })
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(response.status).toBe(200);
      const codes = (response.body as { zwecke: { zweckCode: string }[] }).zwecke.map((z) => z.zweckCode);
      expect(codes).toEqual(
        expect.arrayContaining(['messdaten_verarbeitung', 'nutzerinformation', 'geraeteerkennung']),
      );
    });
  });
});
