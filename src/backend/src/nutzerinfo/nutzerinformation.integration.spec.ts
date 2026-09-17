import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import {
  berechnungslaufBody,
  idempotencyKey,
  legeEndkundeAn,
  legeMvetAn,
  neuesTestJahr,
  starteBerechnungslauf,
} from '../nachweis/test-support/nachweis-test-fixtures';
import { NUTZERINFO_EVENT_CODES } from './audit/nutzerinfo-audit-events';

/**
 * Die monatliche Nutzerinformation gegen eine ECHTE Datenbank (TB-06,
 * [Q3] Kap. 6).
 *
 * **Warum dieser Test nachgereicht wird.** Zwei Fehler im
 * `NutzerinfoRepository` sind in 998d43f auf ANALOGIE hin behoben worden — sie
 * fielen an der Geräteerkennung auf, und dieselben zwei Zeilen standen hier.
 * Ein auf Analogie behobener Fehler ist ein unbelegter Fehler; beide bekommen
 * deshalb hier ihren Beleg:
 *
 * 1. `vermerkeZustellung` band ein `UPDATE ... RETURNING` mit `bindRows` statt
 *    `bindReturningRows` — `.length === 1` war NIE wahr. Der Zustellnachweis,
 *    also genau das, was TB-06 verlangt, war damit ÜBERHAUPT NICHT
 *    vermerkbar: Die Route antwortete jedes Mal 409 („Diese Information
 *    wurde zwischenzeitlich zugestellt"), und weil die Exception den
 *    Savepoint zurückrollt, blieb auch nichts geschrieben.
 * 2. Der BERICHTSMONAT wurde mit `.toISOString().slice(0, 10)` aus einer
 *    SQL-`date`-Spalte gelesen. `pg` konstruiert dort lokale Mitternacht —
 *    östlich von Greenwich also der VORTAG, und am Monatsersten damit der
 *    falsche MONAT. Gemessen: Der Juli-Bericht wies `2025-06-30` aus.
 *
 * Beides ist mit diesen Tests gegengeprüft: Werden die beiden Zeilen im
 * Repository auf ihren alten Stand zurückgesetzt, fallen fünf der elf Tests
 * um — mit genau diesen beiden Befunden.
 *
 * Der ERZEUGUNGSLAUF selbst wird hier im Trockenlauf und über seinen
 * Widerspruchs-Pfad geprüft: Dass eine Information für einen Endkunden mit
 * Widerspruch NICHT entsteht, ist die Kernzusage von TB-06 und braucht keine
 * Messwerte, um belegt zu werden.
 */
describe('Nutzerinformation — Integrationstests (TB-06, [Q3] Kap. 6)', () => {
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

  /**
   * Legt Endkunde + Messkonzept + Berechnungslauf an und schreibt EINE
   * Information direkt in die Tabelle.
   *
   * Direkt, weil der Erzeugungslauf für eine SCHREIBENDE Runde eine
   * vollständige Baseline-Rechnung mit Messwerten braucht — und die Frage
   * dieses Tests eine andere ist: was der Lese- und Zustellpfad AUS einer
   * vorhandenen Zeile macht.
   */
  async function legeInformationAn(monat: string): Promise<{
    id: string;
    endkundeId: string;
    berechnungslaufId: string;
  }> {
    const jahr = Number.parseInt(monat.slice(0, 4), 10);
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `NI-${randomUUID().slice(0, 8)}`);
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
    const lauf = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(endkundeId, mvetId, jahr, {
        periodeVon: monat,
        periodeBis: `${String(jahr + 1)}-01-01`,
      }),
    );
    expect(lauf.status).toBe(201);
    const berechnungslaufId = lauf.body['id'] as string;

    const id = randomUUID();
    await dbClient.query(
      `INSERT INTO nutzerinfo.information
             (id, endkunde_id, energietraeger, monat, berechnungslauf_id,
              referenz_kwh, ist_kwh, delta_kwh,
              qualitaets_stufe, abdeckung_pct, tage_fehlend, kandidaten_anzahl, inhalt_hash)
       VALUES ($1, $2, 'strom', $3::date, $4, 1430.5, 1200.0, 230.5, 'belastbar', 98.5, 1, 1, $5)`,
      [id, endkundeId, monat, berechnungslaufId, createHash('sha256').update(id).digest()],
    );

    return { id, endkundeId, berechnungslaufId };
  }

  describe('Der Berichtsmonat', () => {
    it('weist den Monat aus, der auch in der Datenbank steht — nicht den Vortag', async () => {
      // Der Monatserste ist der gefaehrlichste Tag fuer diesen Fehler: Ein
      // `toISOString()` auf lokaler Mitternacht springt hier nicht nur einen
      // Tag, sondern einen MONAT zurueck. Ein Juli-Bericht, der Juni ausweist,
      // ist gegenueber dem Endkunden schlicht falsch.
      const { id, endkundeId } = await legeInformationAn('2025-07-01');

      const einzeln = await request(testApp.httpServer)
        .get(`/nutzerinfo/informationen/${id}`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(einzeln.status).toBe(200);
      expect((einzeln.body as { monat: string }).monat).toBe('2025-07-01');

      const liste = await request(testApp.httpServer)
        .get('/nutzerinfo/informationen')
        .query({ endkundeId })
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(liste.status).toBe(200);
      expect((liste.body as { monat: string }[])[0]?.monat).toBe('2025-07-01');
    });

    it('gibt Referenz, Ist und die vorzeichenrichtige Differenz aus', async () => {
      const { id } = await legeInformationAn('2025-08-01');

      const response = await request(testApp.httpServer)
        .get(`/nutzerinfo/informationen/${id}`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.body).toMatchObject({
        referenzKwh: 1430.5,
        istKwh: 1200,
        // POSITIV = Einsparung. Das Vorzeichen ist die Aussage; ein Betrag
        // liesse Mehrverbrauch wie Einsparung aussehen.
        deltaKwh: 230.5,
        qualitaetsStufe: 'belastbar',
        zugestelltAt: null,
        zustellweg: null,
      });
    });
  });

  describe('Der Zustellnachweis — das, was TB-06 verlangt', () => {
    it('vermerkt die Zustellung und gibt sie danach zurueck', async () => {
      const { id, endkundeId } = await legeInformationAn('2025-09-01');

      const vermerkt = await request(testApp.httpServer)
        .post(`/nutzerinfo/informationen/${id}/zustellung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ zustellweg: 'brief', zugestelltAt: '2025-10-02T10:00:00.000Z' });

      expect(vermerkt.status).toBe(200);
      expect(vermerkt.body).toMatchObject({
        id,
        zustellweg: 'brief',
        zugestelltAt: '2025-10-02T10:00:00.000Z',
      });

      const gelesen = await request(testApp.httpServer)
        .get('/nutzerinfo/informationen')
        .query({ endkundeId })
        .set('Authorization', `Bearer ${auditorToken}`);
      expect((gelesen.body as { zustellweg: string | null }[])[0]?.zustellweg).toBe('brief');
    });

    it('ueberschreibt einen bereits vermerkten Zeitpunkt NICHT', async () => {
      // Der erste Zeitpunkt ist der Nachweis, dass die Auflage in DIESEM Monat
      // erfuellt wurde. Ein spaeterer an seiner Stelle verschoebe genau die
      // Aussage, um die es geht.
      const { id } = await legeInformationAn('2025-10-01');
      const erste = await request(testApp.httpServer)
        .post(`/nutzerinfo/informationen/${id}/zustellung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ zustellweg: 'brief', zugestelltAt: '2025-11-02T10:00:00.000Z' });
      expect(erste.status).toBe(200);

      const zweite = await request(testApp.httpServer)
        .post(`/nutzerinfo/informationen/${id}/zustellung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ zustellweg: 'portal_bereitgestellt', zugestelltAt: '2025-11-20T10:00:00.000Z' });

      expect(zweite.status).toBe(409);

      const stand = await request(testApp.httpServer)
        .get(`/nutzerinfo/informationen/${id}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(stand.body).toMatchObject({ zustellweg: 'brief', zugestelltAt: '2025-11-02T10:00:00.000Z' });
    });

    it('protokolliert die Zustellung ohne Verbrauchswerte', async () => {
      const { id } = await legeInformationAn('2025-11-01');
      await request(testApp.httpServer)
        .post(`/nutzerinfo/informationen/${id}/zustellung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ zustellweg: 'email', zugestelltAt: '2025-12-02T10:00:00.000Z' });

      const rows = await dbClient.query(
        'SELECT kontext FROM audit.event WHERE event_typ = $1 AND objekt_ref = $2',
        [NUTZERINFO_EVENT_CODES.ZUGESTELLT, id],
      );
      expect(rows.rowCount).toBe(1);
      const kontext = (rows.rows[0] as { kontext: Record<string, unknown> }).kontext;
      expect(kontext['zustellweg']).toBe('email');
      // Was der Kunde verbraucht hat, gehoert nicht ins Protokoll — es steht
      // ueber `objekt_ref` ohnehin auffindbar in `nutzerinfo.information`.
      for (const verboten of ['referenz_kwh', 'ist_kwh', 'delta_kwh']) {
        expect(Object.keys(kontext)).not.toContain(verboten);
      }
    });

    it('meldet eine unbekannte Information als 404', async () => {
      const response = await request(testApp.httpServer)
        .post(`/nutzerinfo/informationen/${randomUUID()}/zustellung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ zustellweg: 'brief', zugestelltAt: '2025-12-02T10:00:00.000Z' });

      expect(response.status).toBe(404);
    });
  });

  describe('Das Kundendokument — der Gegenstand, der den Kunden erreicht', () => {
    it('liefert ein druckfertiges, eigenstaendiges Dokument', async () => {
      // V0054 haelt den Befund selbst fest: „Erzeugen ist nicht informieren."
      // Bis hierher gab es die Zahlen, aber nichts, was man haette geben
      // koennen.
      const monat = `${String(neuesTestJahr())}-05-01`;
      const angelegt = await legeInformationAn(monat);

      const antwort = await request(testApp.httpServer)
        .get(`/nutzerinfo/informationen/${angelegt.id}/dokument`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(antwort.status).toBe(200);
      expect(antwort.headers['content-type']).toContain('text/html');
      expect(antwort.text).toContain('Ihre Energieinformation');
      expect(antwort.text).toContain('1.200 kWh');
      // Eigenstaendig: nichts wird beim Oeffnen automatisch nachgeladen.
      // KEINE Pruefung mehr auf Abwesenheit von "http(s)://": Seit dem
      // Portal-Hinweis (TB-06 Opt-out-Erreichbarkeit) traegt das Dokument
      // bewusst eine Portal-Adresse als Text/Verweis — ein <a href> loest
      // beim Oeffnen keinen Netzzugriff aus, anders als <script>/<img>/<link>.
      expect(antwort.text).not.toContain('<script');
      expect(antwort.text).not.toContain('<img');
      expect(antwort.text).not.toContain('<link');
      // Der Portal-Hinweis selbst — sonst erfaehrt der Kunde nie, dass es
      // das digitale Opt-out gibt (Befund dieser Aenderung). Das WORT
      // "Zugangscode" darf im Fliesstext stehen ("wir senden Ihnen dann
      // einen Zugangscode zu") — nur ein tatsaechlicher Code-WERT
      // (`ABCD-EFGH-JKMN`) darf es nicht, s. Renderer-Test fuer die
      // strukturelle Pruefung.
      expect(antwort.text).toContain('Energieportal');
    });

    it('traegt KEINEN DWD-Quellenvermerk, solange das Klima synthetisch ist', async () => {
      // Auflage A-2/A20: bei synthetischem Klima waere der Vermerk eine
      // Falschangabe. Der Testlauf rechnet mit dem synthetischen Adapter.
      const monat = `${String(neuesTestJahr())}-05-01`;
      const angelegt = await legeInformationAn(monat);

      const antwort = await request(testApp.httpServer)
        .get(`/nutzerinfo/informationen/${angelegt.id}/dokument`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(antwort.text).not.toContain('Wetterdienst');
    });

    it('fasst den ganzen Monat zu EINER Mappe zusammen — Postversand ist ein Stapel', async () => {
      const monat = `${String(neuesTestJahr())}-05-01`;
      await legeInformationAn(monat);
      await legeInformationAn(monat);

      const antwort = await request(testApp.httpServer)
        .get('/nutzerinfo/dokumente')
        .query({ monat })
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(antwort.status).toBe(200);
      expect(antwort.text).toContain('enthält 2 Informationen');
      expect(antwort.text.match(/class="blatt"/g)).toHaveLength(2);
    });

    it('sagt beim leeren Monat, was zu tun ist, statt eine leere Mappe zu drucken', async () => {
      const antwort = await request(testApp.httpServer)
        .get('/nutzerinfo/dokumente')
        .query({ monat: `${String(neuesTestJahr())}-11-01` })
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(antwort.status).toBe(400);
      const problem = antwort.body as { readonly detail?: string };
      expect(problem.detail).toMatch(/Erzeugungslauf/);
    });

    it('laesst auch den Auditor das Dokument lesen — es ist sein Nachweis', async () => {
      const monat = `${String(neuesTestJahr())}-05-01`;
      const angelegt = await legeInformationAn(monat);

      const antwort = await request(testApp.httpServer)
        .get(`/nutzerinfo/informationen/${angelegt.id}/dokument`)
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(antwort.status).toBe(200);
    });
  });

  describe('Die Sammelzustellung — der Stapel, ohne den der Nachweis lueckenhaft bleibt', () => {
    it('vermerkt alle offenen Informationen des Monats in einem Vorgang', async () => {
      const monat = `${String(neuesTestJahr())}-06-01`;
      const a = await legeInformationAn(monat);
      const b = await legeInformationAn(monat);

      const antwort = await request(testApp.httpServer)
        .post('/nutzerinfo/zustellungen')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ monat, zustellweg: 'brief', zugestelltAt: '2026-09-03T08:00:00.000Z' });

      expect(antwort.status).toBe(200);
      expect((antwort.body as { readonly anzahlVermerkt: number }).anzahlVermerkt).toBe(2);

      const gespeichert = await dbClient.query(
        `SELECT id, zustellweg FROM nutzerinfo.information WHERE id = ANY($1) AND zugestellt_at IS NOT NULL`,
        [[a.id, b.id]],
      );
      expect(gespeichert.rowCount).toBe(2);
    });

    it('schreibt ein Audit-Ereignis JE INFORMATION — die Frage lautet spaeter „wurde DIESER Kunde informiert?"', async () => {
      const monat = `${String(neuesTestJahr())}-06-01`;
      const a = await legeInformationAn(monat);
      await legeInformationAn(monat);

      await request(testApp.httpServer)
        .post('/nutzerinfo/zustellungen')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ monat, zustellweg: 'brief', zugestelltAt: '2026-09-03T08:00:00.000Z' });

      const ereignisse = await dbClient.query<{ kontext: Record<string, unknown> }>(
        `SELECT objekt_ref, kontext FROM audit.event
          WHERE event_typ = 'nutzerinfo.information.zugestellt' AND objekt_ref = $1`,
        [a.id],
      );
      expect(ereignisse.rowCount).toBe(1);
      const kontext = ereignisse.rows[0]?.kontext ?? {};
      expect(kontext['zustellweg']).toBe('brief');
      // Keine Verbrauchswerte im Audit-Log (V0055, A9).
      expect(JSON.stringify(kontext)).not.toContain('1200');
    });

    it('laesst einen bereits vermerkten Zeitpunkt stehen und zaehlt ihn getrennt', async () => {
      const monat = `${String(neuesTestJahr())}-06-01`;
      const vorab = await legeInformationAn(monat);
      await legeInformationAn(monat);

      await request(testApp.httpServer)
        .post(`/nutzerinfo/informationen/${vorab.id}/zustellung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ zustellweg: 'email', zugestelltAt: '2026-09-01T08:00:00.000Z' });

      const antwort = await request(testApp.httpServer)
        .post('/nutzerinfo/zustellungen')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ monat, zustellweg: 'brief', zugestelltAt: '2026-09-03T08:00:00.000Z' });

      const bilanz = antwort.body as { readonly anzahlVermerkt: number; readonly anzahlBereitsZugestellt: number };
      expect(bilanz.anzahlVermerkt).toBe(1);
      expect(bilanz.anzahlBereitsZugestellt).toBe(1);

      const unveraendert = await dbClient.query<{ zustellweg: string }>(
        `SELECT zustellweg FROM nutzerinfo.information WHERE id = $1`,
        [vorab.id],
      );
      expect(unveraendert.rows[0]?.zustellweg).toBe('email');
    });

    it('laesst den Auditor NICHT zustellen (403)', async () => {
      const monat = `${String(neuesTestJahr())}-06-01`;
      await legeInformationAn(monat);

      const antwort = await request(testApp.httpServer)
        .post('/nutzerinfo/zustellungen')
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ monat, zustellweg: 'brief', zugestelltAt: '2026-09-03T08:00:00.000Z' });

      expect(antwort.status).toBe(403);
    });
  });

  describe('Der Monatsstand', () => {
    it('zaehlt erzeugt, zugestellt und offen', async () => {
      // „Erzeugt, aber nicht zugestellt" erfuellt die Auflage NICHT — und das
      // soll abfragbar sein, nicht verborgen.
      const monat = '2025-12-01';
      const erste = await legeInformationAn(monat);
      await legeInformationAn(monat);
      await request(testApp.httpServer)
        .post(`/nutzerinfo/informationen/${erste.id}/zustellung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ zustellweg: 'brief', zugestelltAt: '2026-01-02T10:00:00.000Z' });

      const response = await request(testApp.httpServer)
        .get('/nutzerinfo/status')
        .query({ monat })
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        monat,
        anzahlErzeugt: 2,
        anzahlZugestellt: 1,
        anzahlOffen: 1,
      });
    });

    it('weist einen Monat ohne Monatsersten ab', async () => {
      const response = await request(testApp.httpServer)
        .get('/nutzerinfo/status')
        .query({ monat: '2036-01-15' })
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(400);
    });
  });

  describe('Der Erzeugungslauf', () => {
    it('ueberspringt einen Endkunden mit Widerspruch — die Kernzusage von TB-06', async () => {
      // Fester Monat in der VERGANGENHEIT: `lauf()` weist einen laufenden oder
      // kuenftigen Monat ab, `neuesTestJahr()` liefert aber Zukunft (es dient
      // den Foerderjahren). Der Maerz 2025 wird von keinem anderen Lauf dieser
      // Datei ueberdeckt — deren Perioden beginnen im Juli.
      const monat = '2025-03-01';
      const jahr = 2025;
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, `NI-WS-${randomUUID().slice(0, 8)}`);
      const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
      expect(
        (
          await starteBerechnungslauf(
            testApp,
            betriebToken,
            berechnungslaufBody(endkundeId, mvetId, jahr, { periodeVon: monat, periodeBis: `${String(jahr)}-04-01` }),
          )
        ).status,
      ).toBe(201);

      const ohneWiderspruch = await request(testApp.httpServer)
        .post('/nutzerinfo/laeufe')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ monat });
      expect(ohneWiderspruch.status).toBe(200);
      const vorher = ohneWiderspruch.body as { uebersprungenWiderspruch: number };

      const widerspruch = await request(testApp.httpServer)
        .post('/consent/widersprueche')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          subjektTyp: 'endkunde',
          subjektId: endkundeId,
          zweckCode: 'nutzerinformation',
          erfassungsweg: 'vertrag_schriftlich',
          erklaertAt: `${String(jahr)}-03-15T10:00:00.000Z`,
          quelleRef: 'AZ-TEST-WS-0001',
        });
      expect(widerspruch.status).toBe(201);

      const nachher = await request(testApp.httpServer)
        .post('/nutzerinfo/laeufe')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ monat });

      expect(nachher.status).toBe(200);
      expect((nachher.body as { uebersprungenWiderspruch: number }).uebersprungenWiderspruch).toBe(
        vorher.uebersprungenWiderspruch + 1,
      );
    });

    it('lehnt einen laufenden Monat ab', async () => {
      // Ein laufender Monat ergaebe einen zu niedrigen Verbrauch — und nach
      // der Zustellung wird nicht mehr korrigiert.
      const jetzt = new Date();
      const laufend = `${String(jetzt.getUTCFullYear())}-${String(jetzt.getUTCMonth() + 1).padStart(2, '0')}-01`;

      const response = await request(testApp.httpServer)
        .post('/nutzerinfo/laeufe')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ monat: laufend });

      expect(response.status).toBe(400);
    });

    it('laesst den Auditor NICHT ausloesen (403)', async () => {
      const response = await request(testApp.httpServer)
        .post('/nutzerinfo/laeufe')
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ monat: '2035-01-01' });

      expect(response.status).toBe(403);
    });
  });
});
