import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';

const PASSWORT = 'Ein-sicheres-Passwort-2026';

/**
 * Das Nutzerportal — Zugangscode, Einlösen, Anmelden, Abmelden ([Q3] Kap. 6).
 *
 * **Warum das ein Integrationstest sein MUSS.** Die tragenden Zusagen dieses
 * Fundaments sind nicht in einem Unit-Test prüfbar: dass der Code nach dem
 * Einlösen tatsächlich verbraucht ist (DB-Zustand), dass eine Sperre offene
 * Sitzungen beendet (zwei Tabellen), dass ein nach Art. 18 gesperrter
 * Endkunde nicht mehr durchkommt (drittes Schema) und dass das Token
 * ausschließlich im Cookie steht und nirgends im Body.
 */
describe('Nutzerportal — Integrationstests ([Q3] Kap. 6, V0066-V0068)', () => {
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

  function idempotencyKey(): string {
    return randomUUID();
  }

  async function legeEndkundeAn(): Promise<string> {
    const response = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ stammdatenPii: { name: `Portal ${randomUUID().slice(0, 8)}`, anschrift: 'Teststrasse 1' } });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function gibCodeAus(endkundeId: string): Promise<{ kennung: string; code: string; erneut: boolean }> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/portal-zugang/codes`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    expect(response.status).toBe(201);
    return response.body as { kennung: string; code: string; erneut: boolean };
  }

  /** `Set-Cookie` kommt je nach Anzahl als Array oder als einzelner String. */
  function kopfzeilen(response: request.Response): string[] {
    const gesetzt: unknown = response.headers['set-cookie'];
    if (Array.isArray(gesetzt)) {
      return gesetzt as string[];
    }
    return typeof gesetzt === 'string' ? [gesetzt] : [];
  }

  /** Holt das Sitzungs-Cookie aus einer Antwort — es steht NUR dort. */
  function sitzungsCookie(response: request.Response): string {
    const cookie = kopfzeilen(response).find((z) => z.startsWith('__Host-edms_portal='));
    expect(cookie).toBeDefined();
    return (cookie ?? '').split(';')[0] ?? '';
  }

  async function loeseEin(code: string): Promise<request.Response> {
    return request(testApp.httpServer).post('/portal/auth/einloesen').send({ code, passwort: PASSWORT });
  }

  describe('Der Weg vom Brief ins Portal', () => {
    it('gibt einen Code aus, loest ihn ein und traegt die Sitzung', async () => {
      const endkundeId = await legeEndkundeAn();
      const ausgabe = await gibCodeAus(endkundeId);

      expect(ausgabe.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(ausgabe.kennung).toMatch(/^EK-[A-Z2-9]{6}$/);
      expect(ausgabe.erneut).toBe(false);

      const eingeloest = await loeseEin(ausgabe.code);
      expect(eingeloest.status).toBe(200);

      const ich = await request(testApp.httpServer)
        .get('/portal/auth/ich')
        .set('Cookie', sitzungsCookie(eingeloest));
      expect(ich.status).toBe(200);
      expect((ich.body as { endkundeId: string }).endkundeId).toBe(endkundeId);
    });

    it('gibt das Sitzungs-Token NUR im __Host--Cookie aus, nie im Body', async () => {
      // Ein Token, das JavaScript lesen kann, ueberlebt jede XSS-Luecke der
      // Oberflaeche.
      const ausgabe = await gibCodeAus(await legeEndkundeAn());
      const eingeloest = await loeseEin(ausgabe.code);

      expect(JSON.stringify(eingeloest.body)).not.toContain('token');
      const cookie = sitzungsCookie(eingeloest);
      const kopf = kopfzeilen(eingeloest).find((z) => z.startsWith('__Host-edms_portal='));
      expect(kopf).toContain('HttpOnly');
      expect(kopf).toContain('Secure');
      expect(kopf).toContain('SameSite=Strict');
      expect(cookie.length).toBeGreaterThan('__Host-edms_portal='.length + 20);
    });

    it('verbraucht den Code beim Einloesen — der Brief ist danach wertlos', async () => {
      const endkundeId = await legeEndkundeAn();
      const ausgabe = await gibCodeAus(endkundeId);
      expect((await loeseEin(ausgabe.code)).status).toBe(200);

      // Zweiter Versuch mit demselben Code.
      expect((await loeseEin(ausgabe.code)).status).toBe(401);

      const zeile = await dbClient.query<{ code_hash: Buffer | null; status: string }>(
        'SELECT code_hash, status FROM portal.zugang WHERE endkunde_id = $1',
        [endkundeId],
      );
      expect(zeile.rows[0]?.code_hash).toBeNull();
      expect(zeile.rows[0]?.status).toBe('aktiv');
    });

    it('meldet danach mit Kennung und Passwort an', async () => {
      const ausgabe = await gibCodeAus(await legeEndkundeAn());
      await loeseEin(ausgabe.code);

      const anmeldung = await request(testApp.httpServer)
        .post('/portal/auth/anmeldung')
        .send({ kennung: ausgabe.kennung, passwort: PASSWORT });

      expect(anmeldung.status).toBe(200);
      expect((anmeldung.body as { kennung: string }).kennung).toBe(ausgabe.kennung);
    });

    it('speichert das Passwort NUR abgeleitet — nie im Klartext', async () => {
      const endkundeId = await legeEndkundeAn();
      const ausgabe = await gibCodeAus(endkundeId);
      await loeseEin(ausgabe.code);

      const zeile = await dbClient.query<{ passwort_hash: Buffer; passwort_algo: string }>(
        'SELECT passwort_hash, passwort_algo FROM portal.zugang WHERE endkunde_id = $1',
        [endkundeId],
      );
      expect(zeile.rows[0]?.passwort_hash.toString('utf8')).not.toContain(PASSWORT);
      // Die Parameter stehen MIT in der Zeile — sonst waeren alte Hashes nach
      // einer Erhoehung nicht mehr pruefbar.
      expect(zeile.rows[0]?.passwort_algo).toMatch(/^scrypt\$\d+\$\d+\$\d+$/);
    });
  });

  describe('Was NICHT durchkommt', () => {
    it('antwortet auf jeden Fehlschlag mit derselben Meldung', async () => {
      // Jede Differenzierung waere eine Auskunft an den, der durchprobiert.
      const ausgabe = await gibCodeAus(await legeEndkundeAn());
      await loeseEin(ausgabe.code);

      const unbekannt = await request(testApp.httpServer)
        .post('/portal/auth/anmeldung')
        .send({ kennung: 'EK-ZZZZZZ', passwort: PASSWORT });
      const falsch = await request(testApp.httpServer)
        .post('/portal/auth/anmeldung')
        .send({ kennung: ausgabe.kennung, passwort: 'Ein-ganz-anderes-Passwort' });

      expect(unbekannt.status).toBe(401);
      expect(falsch.status).toBe(401);
      expect((unbekannt.body as { detail: string }).detail).toBe((falsch.body as { detail: string }).detail);
    });

    it('weist ein zu kurzes Passwort beim Einloesen KONKRET ab — hier hilft die Genauigkeit', async () => {
      const ausgabe = await gibCodeAus(await legeEndkundeAn());

      const antwort = await request(testApp.httpServer)
        .post('/portal/auth/einloesen')
        .send({ code: ausgabe.code, passwort: 'kurz' });

      expect(antwort.status).toBe(400);
      expect((antwort.body as { detail: string }).detail).toMatch(/12 und 200 Zeichen/);
    });

    it('laesst niemanden ohne Sitzung an /portal/auth/ich', async () => {
      expect((await request(testApp.httpServer).get('/portal/auth/ich')).status).toBe(401);
      expect(
        (await request(testApp.httpServer).get('/portal/auth/ich').set('Cookie', '__Host-edms_portal=erfunden')).status,
      ).toBe(401);
    });

    it('sperrt nach mehreren Fehlversuchen', async () => {
      // Die einzige Bremse gegen das Durchprobieren eines abtippbaren Codes.
      const ausgabe = await gibCodeAus(await legeEndkundeAn());
      await loeseEin(ausgabe.code);

      for (let i = 0; i < 5; i += 1) {
        await request(testApp.httpServer)
          .post('/portal/auth/anmeldung')
          .send({ kennung: ausgabe.kennung, passwort: 'falsch-falsch-falsch' });
      }

      // Jetzt auch MIT richtigem Passwort abgewiesen.
      const mitRichtigem = await request(testApp.httpServer)
        .post('/portal/auth/anmeldung')
        .send({ kennung: ausgabe.kennung, passwort: PASSWORT });
      expect(mitRichtigem.status).toBe(401);
    }, 60_000);

    it('laesst einen nach Art. 18 gesperrten Endkunden nicht mehr durch', async () => {
      // Die Sitzung darf die Einschraenkung nicht ueberleben.
      const endkundeId = await legeEndkundeAn();
      const ausgabe = await gibCodeAus(endkundeId);
      const eingeloest = await loeseEin(ausgabe.code);
      const cookie = sitzungsCookie(eingeloest);
      expect((await request(testApp.httpServer).get('/portal/auth/ich').set('Cookie', cookie)).status).toBe(200);

      await dbClient.query(`UPDATE energy.endkunde SET verarbeitungs_status = 'gesperrt' WHERE id = $1`, [endkundeId]);

      expect((await request(testApp.httpServer).get('/portal/auth/ich').set('Cookie', cookie)).status).toBe(401);
    });

    it('gibt fuer einen gesperrten Endkunden gar keinen neuen Code aus', async () => {
      const endkundeId = await legeEndkundeAn();
      await dbClient.query(`UPDATE energy.endkunde SET verarbeitungs_status = 'gesperrt' WHERE id = $1`, [endkundeId]);

      const antwort = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/portal-zugang/codes`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({});

      expect(antwort.status).toBe(409);
      expect((antwort.body as { detail: string }).detail).toMatch(/Art\. 18/);
    });
  });

  describe('Sperren und Abmelden', () => {
    it('beendet beim Sperren alle offenen Sitzungen — sonst waere die Sperre eine Ankuendigung', async () => {
      const endkundeId = await legeEndkundeAn();
      const ausgabe = await gibCodeAus(endkundeId);
      const cookie = sitzungsCookie(await loeseEin(ausgabe.code));

      const gesperrt = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/portal-zugang/sperre`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({});
      expect(gesperrt.status).toBe(200);

      expect((await request(testApp.httpServer).get('/portal/auth/ich').set('Cookie', cookie)).status).toBe(401);
    });

    it('fuehrt aus einer Sperre KEIN neuer Code heraus', async () => {
      const endkundeId = await legeEndkundeAn();
      await gibCodeAus(endkundeId);
      await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/portal-zugang/sperre`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({});

      const erneut = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/portal-zugang/codes`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({});

      expect(erneut.status).toBe(409);
    });

    it('meldet ab und loescht das Cookie — auch bei abgelaufener Sitzung', async () => {
      const ausgabe = await gibCodeAus(await legeEndkundeAn());
      const cookie = sitzungsCookie(await loeseEin(ausgabe.code));

      const abgemeldet = await request(testApp.httpServer).post('/portal/auth/abmeldung').set('Cookie', cookie);
      expect(abgemeldet.status).toBe(204);
      expect(kopfzeilen(abgemeldet)[0]).toContain('Max-Age=0');

      expect((await request(testApp.httpServer).get('/portal/auth/ich').set('Cookie', cookie)).status).toBe(401);
      // Zweites Abmelden ist unschaedlich — sonst bliebe das Cookie stehen.
      expect((await request(testApp.httpServer).post('/portal/auth/abmeldung').set('Cookie', cookie)).status).toBe(204);
    });
  });

  describe('Betriebssicht und Audit', () => {
    it('zeigt den Stand OHNE Code — es gibt keinen Weg, ihn erneut zu lesen', async () => {
      const endkundeId = await legeEndkundeAn();
      const ausgabe = await gibCodeAus(endkundeId);

      const stand = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}/portal-zugang`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(stand.status).toBe(200);
      expect(JSON.stringify(stand.body)).not.toContain(ausgabe.code);
      expect((stand.body as { kennung: string; passwortGesetzt: boolean }).kennung).toBe(ausgabe.kennung);
      expect((stand.body as { passwortGesetzt: boolean }).passwortGesetzt).toBe(false);
    });

    it('laesst den Auditor lesen, aber nicht ausgeben', async () => {
      const endkundeId = await legeEndkundeAn();

      expect(
        (
          await request(testApp.httpServer)
            .get(`/stammdaten/endkunden/${endkundeId}/portal-zugang`)
            .set('Authorization', `Bearer ${auditorToken}`)
        ).status,
      ).toBe(200);
      expect(
        (
          await request(testApp.httpServer)
            .post(`/stammdaten/endkunden/${endkundeId}/portal-zugang/codes`)
            .set('Authorization', `Bearer ${auditorToken}`)
            .set('Idempotency-Key', idempotencyKey())
            .send({})
        ).status,
      ).toBe(403);
    });

    it('protokolliert die Ausgabe mit dem Mitarbeiter, das Einloesen mit actor_typ=endkunde', async () => {
      // Ein Mitarbeiter, der Daten verarbeitet, und eine betroffene Person,
      // die ihre eigenen ansieht, sind rechtlich zwei verschiedene Vorgaenge.
      const endkundeId = await legeEndkundeAn();
      const ausgabe = await gibCodeAus(endkundeId);
      await loeseEin(ausgabe.code);

      const zugang = await dbClient.query<{ id: string }>('SELECT id FROM portal.zugang WHERE endkunde_id = $1', [
        endkundeId,
      ]);
      const zugangId = zugang.rows[0]?.id;

      const ereignisse = await dbClient.query<{ event_typ: string; actor_typ: string; kontext: Record<string, unknown> }>(
        `SELECT event_typ, actor_typ, kontext FROM audit.event WHERE objekt_ref = $1 ORDER BY seq`,
        [zugangId],
      );
      const typen = ereignisse.rows.map((r) => `${r.event_typ}/${r.actor_typ}`);

      expect(typen).toContain('portal.zugang.ausgegeben/benutzer');
      expect(typen).toContain('portal.zugang.eingeloest/endkunde');
      expect(typen).toContain('portal.anmeldung/endkunde');
      // Der Code darf NIRGENDS im Log stehen — er existiert genau einmal.
      expect(JSON.stringify(ereignisse.rows)).not.toContain(ausgabe.code);
    });

    it('protokolliert einen Fehlschlag mit Grund, aber ohne Auskunft ueber die Kennung', async () => {
      // Zeitschranke statt `ORDER BY seq`: `audit.event` ist eine Hypertable
      // mit LANES, `seq` laeuft je Lane — ueber Lanes hinweg ist es keine
      // Chronologie. Und die Tests teilen sich die Datenbank.
      const vorher = new Date();

      await request(testApp.httpServer)
        .post('/portal/auth/anmeldung')
        .send({ kennung: 'EK-YYYYYY', passwort: 'irgendwas-langes-hier' });

      const ereignisse = await dbClient.query<{ kontext: Record<string, unknown> }>(
        `SELECT kontext FROM audit.event
          WHERE event_typ = 'portal.anmeldung' AND ergebnis = 'error' AND ts >= $1`,
        [vorher],
      );
      expect(ereignisse.rowCount).toBe(1);
      expect(ereignisse.rows[0]?.kontext['grund']).toBe('unbekannt');
      // Die Kennung selbst darf NIRGENDS stehen — sie waere eine Auskunft
      // darueber, welche Kennungen jemand probiert hat.
      expect(JSON.stringify(ereignisse.rows[0]?.kontext)).not.toContain('EK-YYYYYY');
    });

    it('vermerkt einen Ersatzbrief als erneute Ausgabe', async () => {
      // Ein wiederholtes Ausgeben kann ein verlorener Brief sein oder ein
      // Versuch, sich Zugang zu fremden Daten zu verschaffen.
      const endkundeId = await legeEndkundeAn();
      await gibCodeAus(endkundeId);
      const zweite = await gibCodeAus(endkundeId);

      expect(zweite.erneut).toBe(true);
      const zugang = await dbClient.query<{ id: string }>('SELECT id FROM portal.zugang WHERE endkunde_id = $1', [
        endkundeId,
      ]);
      const ereignisse = await dbClient.query<{ kontext: Record<string, unknown> }>(
        `SELECT kontext FROM audit.event
          WHERE event_typ = 'portal.zugang.ausgegeben' AND objekt_ref = $1`,
        [zugang.rows[0]?.id],
      );
      // Auf den INHALT geprueft, nicht auf die Reihenfolge: `seq` laeuft je
      // Lane und ist ueber Lanes hinweg keine Chronologie. Die Aussage ist,
      // dass GENAU EINE Ausgabe als Ersatzbrief vermerkt ist.
      const werte = ereignisse.rows.map((r) => r.kontext['erneut']);
      expect(werte).toHaveLength(2);
      expect(werte.filter((w) => w === false)).toHaveLength(1);
      expect(werte.filter((w) => w === true)).toHaveLength(1);
    });
  });
  describe('Der Kundenbereich — was ein Angemeldeter ueber sich sieht und tut', () => {
    /** Meldet einen frischen Endkunden an und liefert sein Sitzungs-Cookie. */
    async function angemeldeterKunde(): Promise<{ endkundeId: string; cookie: string }> {
      const endkundeId = await legeEndkundeAn();
      const ausgabe = await gibCodeAus(endkundeId);
      const antwort = await loeseEin(ausgabe.code);
      expect(antwort.status).toBe(200);
      return { endkundeId, cookie: sitzungsCookie(antwort) };
    }

    it('liefert den eigenen Verlauf — ohne dass irgendwo eine Kennung mitgegeben wuerde', async () => {
      const { cookie } = await angemeldeterKunde();

      const antwort = await request(testApp.httpServer).get('/portal/informationen').set('Cookie', cookie);

      expect(antwort.status).toBe(200);
      // Frisch angelegt: noch keine Monatsinformation. Die Aussage des Tests
      // ist, dass die Route OHNE Parameter traegt — nicht, dass sie leer ist.
      expect(Array.isArray(antwort.body)).toBe(true);
    });

    it('weist ohne Sitzung ab', async () => {
      expect((await request(testApp.httpServer).get('/portal/informationen')).status).toBe(401);
      expect((await request(testApp.httpServer).get('/portal/widerspruch')).status).toBe(401);
      expect((await request(testApp.httpServer).post('/portal/widerspruch').send({})).status).toBe(401);
    });

    it('antwortet auf eine fremde Information mit 403 und nicht mit 404', async () => {
      // Der Unterschied waere eine Auskunft darueber, welche Kennungen es
      // gibt — dieselbe Ueberlegung wie bei der einheitlichen Anmeldemeldung.
      const { cookie } = await angemeldeterKunde();

      const antwort = await request(testApp.httpServer)
        .get(`/portal/informationen/${randomUUID()}/bericht`)
        .set('Cookie', cookie);

      expect(antwort.status).toBe(403);
    });

    it('meldet zuerst KEINEN Widerspruch', async () => {
      const { cookie } = await angemeldeterKunde();

      const antwort = await request(testApp.httpServer).get('/portal/widerspruch').set('Cookie', cookie);

      expect(antwort.status).toBe(200);
      expect(antwort.body).toMatchObject({ zweckCode: 'nutzerinformation', wirksam: false, widerspruchId: null });
    });

    it('nimmt das digitale Opt-out entgegen und belegt es mit Zeitpunkt und IP (DS-03)', async () => {
      const { endkundeId, cookie } = await angemeldeterKunde();

      const antwort = await request(testApp.httpServer).post('/portal/widerspruch').set('Cookie', cookie).send({});

      expect(antwort.status).toBe(200);
      expect(antwort.body).toMatchObject({ wirksam: true });
      expect((antwort.body as { erklaertAt: string }).erklaertAt).toBeTruthy();

      const widerspruch = await dbClient.query<{ id: string; erfassungsweg: string }>(
        `SELECT id, erfassungsweg FROM consent.widerspruch
          WHERE endkunde_id = $1 AND zweck_code = 'nutzerinformation'`,
        [endkundeId],
      );
      expect(widerspruch.rowCount).toBe(1);
      // `digital_opt_in` ist der Unterschied zum nachgetragenen Widerspruch:
      // Hier hat die betroffene Person selbst erklaert.
      expect(widerspruch.rows[0]?.erfassungsweg).toBe('digital_opt_in');

      const beleg = await dbClient.query<{ art: string; ipEnc: Buffer | null }>(
        `SELECT art, ip_enc AS "ipEnc" FROM identity.widerspruch_beleg WHERE widerspruch_id = $1`,
        [widerspruch.rows[0]?.id],
      );
      expect(beleg.rowCount).toBe(1);
      expect(beleg.rows[0]?.art).toBe('erklaerung');
      // Die IP steht verschluesselt da — im Klartext waere sie ein
      // Personenbezug in einer Tabelle, die der Loeschlauf nicht kennt.
      expect(beleg.rows[0]?.ipEnc).not.toBeNull();
    });

    it('weist einen zweiten Widerspruch ab, statt einen zweiten anzulegen', async () => {
      const { cookie } = await angemeldeterKunde();
      expect((await request(testApp.httpServer).post('/portal/widerspruch').set('Cookie', cookie).send({})).status).toBe(
        200,
      );

      const zweiter = await request(testApp.httpServer).post('/portal/widerspruch').set('Cookie', cookie).send({});

      expect(zweiter.status).toBe(409);
    });

    it('nimmt den Widerspruch zurueck und LAESST die Zeile stehen', async () => {
      // Geloescht verschwaende der Nachweis ueber den Zeitraum, in dem
      // widersprochen war — und genau der entscheidet, ob in dieser Zeit
      // informiert werden durfte.
      const { endkundeId, cookie } = await angemeldeterKunde();
      await request(testApp.httpServer).post('/portal/widerspruch').set('Cookie', cookie).send({});

      const antwort = await request(testApp.httpServer)
        .post('/portal/widerspruch/ruecknahme')
        .set('Cookie', cookie)
        .send({});

      expect(antwort.status).toBe(200);
      expect(antwort.body).toMatchObject({ wirksam: false, widerspruchId: null });

      const zeilen = await dbClient.query<{ zurueckgenommen_at: Date | null }>(
        `SELECT zurueckgenommen_at FROM consent.widerspruch WHERE endkunde_id = $1`,
        [endkundeId],
      );
      expect(zeilen.rowCount).toBe(1);
      expect(zeilen.rows[0]?.zurueckgenommen_at).not.toBeNull();

      const belege = await dbClient.query<{ art: string }>(
        `SELECT b.art FROM identity.widerspruch_beleg b
           JOIN consent.widerspruch w ON w.id = b.widerspruch_id
          WHERE w.endkunde_id = $1 ORDER BY b.art`,
        [endkundeId],
      );
      // Beide Richtungen sind belegt — eine Ruecknahme ohne Beleg waere die
      // Behauptung, jemand habe sie erklaert.
      expect(belege.rows.map((r) => r.art)).toEqual(['erklaerung', 'ruecknahme']);
    });

    it('weist eine Ruecknahme ohne wirksamen Widerspruch ab, statt still Erfolg zu melden', async () => {
      const { cookie } = await angemeldeterKunde();

      const antwort = await request(testApp.httpServer)
        .post('/portal/widerspruch/ruecknahme')
        .set('Cookie', cookie)
        .send({});

      expect(antwort.status).toBe(403);
    });
  });

  describe('Der Zugangsbrief', () => {
    it('kommt mit der Ausgabe — er koennte spaeter nicht mehr erzeugt werden', async () => {
      const endkundeId = await legeEndkundeAn();

      const antwort = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/portal-zugang/codes`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({});

      expect(antwort.status).toBe(201);
      const koerper = antwort.body as { code: string; kennung: string; brief: string; portalUrl: string };
      expect(koerper.brief).toContain(koerper.code);
      expect(koerper.brief).toContain(koerper.kennung);
      expect(koerper.brief).toContain(koerper.portalUrl);
      // Ein Brief, der beim Oeffnen nachlaedt, verraet dem Betreiber der
      // geladenen Ressource, wann und wo er geoeffnet wurde.
      expect(koerper.brief).not.toContain('<script');
    });

    it('weist den Ersatzbrief als solchen aus', async () => {
      const endkundeId = await legeEndkundeAn();
      await gibCodeAus(endkundeId);

      const zweite = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/portal-zugang/codes`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({});

      expect((zweite.body as { brief: string }).brief).toContain('Ersatzbrief');
    });
  });
});
