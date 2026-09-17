import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import {
  idempotencyKey,
  legeEndkundeAn,
  legeFoerderjahrAn,
  legeSystemAn,
  neuesTestJahr,
} from '../nachweis/test-support/nachweis-test-fixtures';

/**
 * Die Zuordnungsquote gegen eine ECHTE Datenbank ([Q3] Kap. 5, TB-05).
 *
 * **Warum diese Zahl einen eigenen Test bekommt.** Sie ist die einzige, die
 * gegenüber der Bewilligungsbehörde belegt, dass 20 bis 40 Prozent des
 * Jahresverbrauchs Geräten zugeordnet werden können — und sie entsteht aus
 * einem SQL-Ausdruck mit zwei `FILTER`-Klauseln, einer LATERAL-Auflösung je
 * Tag und einem Zeitfenster. Kein Unit-Test mit einem Repository-Mock kann
 * davon irgendetwas prüfen: Er prüft dann die Division, nicht die Zahl.
 *
 * **Die Tageswerte werden direkt geschrieben, nicht verdichtet.** Die
 * Verdichtung hat ihren eigenen Test
 * (`retention/messwert-verdichtung.integration.spec.ts`); hier geht es um
 * die Frage, was die Quote AUS Tageswerten macht. Ein Verdichtungslauf als
 * Vorstufe würde beide Fragen vermengen und den Fehler beim Scheitern nicht
 * mehr lokalisieren lassen.
 *
 * Jeder Test bekommt einen EIGENEN Endkunden. Die Quote summiert über alle
 * Systeme eines Endkunden — zwei Tests auf demselben zögen sich gegenseitig
 * in die Rechnung.
 */
describe('Zuordnungsquote — Integrationstests (TB-05, [Q3] Kap. 5)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let dbClient: Client;

  /** Jahr, dessen Januar-März das Förderjahr-Fenster der Fixture ist. */
  const JAHR = 2035;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
  }, 180_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  async function legeKanalAn(
    systemId: string,
    energietraeger: string,
    istUntermessung = false,
  ): Promise<{ id: string; key: number }> {
    const zaehler = await request(testApp.httpServer)
      .post('/stammdaten/zaehler')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ systemId, geraetetyp: 'Testzaehler', energietraeger });
    expect(zaehler.status).toBe(201);

    const kanal = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${(zaehler.body as { id: string }).id}/messkanaele`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ messgroesse: 'Wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand', istUntermessung });
    expect(kanal.status).toBe(201);
    const id = (kanal.body as { id: string }).id;

    const keyRow = await dbClient.query('SELECT kanal_key FROM energy.messkanal WHERE id = $1', [id]);
    return { id, key: (keyRow.rows[0] as { kanal_key: number }).kanal_key };
  }

  /** Schreibt `anzahl` aufeinanderfolgende Tageswerte ab `abTag` mit je `kwh`. */
  async function schreibeTageswerte(kanalKey: number, abTag: string, anzahl: number, kwh: number): Promise<void> {
    await dbClient.query(
      `INSERT INTO measurement.messwert_tag
             (messkanal_key, tag, zeitzone, verbrauch_kwh, qualitaet_min, anzahl_messwerte)
       SELECT $1, ($2::date + (n || ' days')::interval)::date, 'Europe/Berlin', $4, 1, 96
         FROM generate_series(0, $3::int - 1) AS n`,
      [kanalKey, abTag, anzahl, kwh],
    );
  }

  async function legeGruppeAn(endkundeId: string, bezeichnung: string): Promise<string> {
    const response = await request(testApp.httpServer)
      .post('/geraeteerkennung/gruppen')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ endkundeId, bezeichnung });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function zuordne(body: Record<string, unknown>): Promise<void> {
    const response = await request(testApp.httpServer)
      .post('/geraeteerkennung/zuordnungen')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(body);
    expect(response.status).toBe(201);
  }

  interface QuoteAntwort {
    readonly gesamtKwh: number;
    readonly zugeordnetKwh: number;
    readonly quotePct: number | null;
    readonly sollQuotePct: number;
    readonly erreicht: boolean | null;
    readonly ohneTageswerte: boolean;
    readonly alleSystemeEntbehrlich: boolean;
    readonly systemeGesamt: number;
    readonly systemeEntbehrlich: number;
    readonly gruppen: readonly { geraetegruppeId: string; bezeichnung: string; zugeordnetKwh: number; anteilPct: number }[];
  }

  async function holeQuote(
    endkundeId: string,
    foerderjahrId: string,
    energietraeger = 'strom',
  ): Promise<QuoteAntwort> {
    const response = await request(testApp.httpServer)
      .get('/geraeteerkennung/quote')
      .query({ endkundeId, energietraeger, foerderjahrId })
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(response.status).toBe(200);
    return response.body as QuoteAntwort;
  }

  /** Endkunde + System + Förderjahr Januar–März `JAHR` (Projektjahr 1 → Soll 20 %). */
  async function neueSzene(name: string, nummer = 1): Promise<{
    endkundeId: string;
    systemId: string;
    foerderjahrId: string;
  }> {
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, `Q-${name}-${randomUUID().slice(0, 8)}`);
    const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, `System ${name}`);
    const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, neuesTestJahr(), {
      nummer,
      vonMonat: `${JAHR}-01-01`,
      bisMonat: `${JAHR}-03-01`,
    });
    return { endkundeId, systemId, foerderjahrId };
  }

  describe('Was in den Nenner gehoert — und was nicht', () => {
    it('zaehlt eine Untermessung NICHT zusaetzlich in den Nenner', async () => {
      // Der Kern der Rechnung. Die Untermessung steckt bereits in der
      // Hauptmessung; summierte man beide, waere derselbe Strom zweimal im
      // Nenner und die Quote systematisch zu niedrig (hier: 20 statt 25 %).
      const { endkundeId, systemId, foerderjahrId } = await neueSzene('Untermessung');
      const haupt = await legeKanalAn(systemId, 'strom');
      const unter = await legeKanalAn(systemId, 'strom', true);
      await schreibeTageswerte(haupt.key, `${JAHR}-01-01`, 10, 100); // 1000 kWh
      await schreibeTageswerte(unter.key, `${JAHR}-01-01`, 10, 25); //  250 kWh

      const gruppeId = await legeGruppeAn(endkundeId, 'Beleuchtung');
      await zuordne({
        geraetegruppeId: gruppeId,
        messkanalId: unter.id,
        methode: 'direktmessung',
        gueltigVon: `${JAHR}-01-01`,
      });

      const quote = await holeQuote(endkundeId, foerderjahrId);

      expect(quote.gesamtKwh).toBe(1000);
      expect(quote.zugeordnetKwh).toBe(250);
      expect(quote.quotePct).toBe(25);
      expect(quote.sollQuotePct).toBe(20);
      expect(quote.erreicht).toBe(true);
    });

    it('zaehlt einen eigenen Zaehler neben der Hauptmessung in Zaehler UND Nenner', async () => {
      // `imGesamtverbrauchEnthalten: false` — die Gruppe haengt an einem
      // eigenen Zaehler, ihr Verbrauch steckt NICHT in der Hauptmessung.
      const { endkundeId, systemId, foerderjahrId } = await neueSzene('EigenerZaehler');
      const haupt = await legeKanalAn(systemId, 'strom');
      const eigen = await legeKanalAn(systemId, 'strom');
      await schreibeTageswerte(haupt.key, `${JAHR}-01-01`, 10, 75); // 750 kWh
      await schreibeTageswerte(eigen.key, `${JAHR}-01-01`, 10, 25); // 250 kWh

      const gruppeId = await legeGruppeAn(endkundeId, 'Kaelte');
      await zuordne({
        geraetegruppeId: gruppeId,
        messkanalId: eigen.id,
        methode: 'direktmessung',
        gueltigVon: `${JAHR}-01-01`,
      });

      const quote = await holeQuote(endkundeId, foerderjahrId);

      expect(quote.gesamtKwh).toBe(1000);
      expect(quote.zugeordnetKwh).toBe(250);
      expect(quote.quotePct).toBe(25);
    });

    it('laesst einen anderen Energietraeger unberuehrt', async () => {
      // Die Auflage gilt je Energietraeger. Ein Gas-Zaehler darf die
      // Strom-Quote weder heben noch senken.
      const { endkundeId, systemId, foerderjahrId } = await neueSzene('Energietraeger');
      const strom = await legeKanalAn(systemId, 'strom');
      const gas = await legeKanalAn(systemId, 'gas');
      await schreibeTageswerte(strom.key, `${JAHR}-01-01`, 10, 100);
      await schreibeTageswerte(gas.key, `${JAHR}-01-01`, 10, 900);

      const quote = await holeQuote(endkundeId, foerderjahrId, 'strom');

      expect(quote.gesamtKwh).toBe(1000);
      expect(quote.zugeordnetKwh).toBe(0);
      expect(quote.quotePct).toBe(0);
      expect(quote.erreicht).toBe(false);
    });
  });

  describe('Wann eine Zuordnung wirkt — und wann nicht mehr', () => {
    it('zaehlt nur die Tage, an denen die Zuordnung galt', async () => {
      // Die LATERAL-Aufloesung je Tag ist der Grund, warum die Quote der
      // Vergangenheit stabil bleibt, wenn heute jemand eine Zuordnung
      // beendet. 20 Tage Verbrauch, Zuordnung ab Tag 11 — also die Haelfte.
      const { endkundeId, systemId, foerderjahrId } = await neueSzene('Zeitfenster');
      const haupt = await legeKanalAn(systemId, 'strom');
      const unter = await legeKanalAn(systemId, 'strom', true);
      await schreibeTageswerte(haupt.key, `${JAHR}-01-01`, 20, 100); // 2000 kWh
      await schreibeTageswerte(unter.key, `${JAHR}-01-01`, 20, 50); // 1000 kWh, davon 500 zugeordnet

      const gruppeId = await legeGruppeAn(endkundeId, 'Lueftung');
      await zuordne({
        geraetegruppeId: gruppeId,
        messkanalId: unter.id,
        methode: 'direktmessung',
        gueltigVon: `${JAHR}-01-11`,
      });

      const quote = await holeQuote(endkundeId, foerderjahrId);

      // Nenner: NUR die 2000 der Hauptmessung. Vor V0058 stand die Topologie
      // an der ZUORDNUNG, und an den Tagen ohne Zuordnung wurde die
      // Untermessung wie eine Hauptmessung behandelt — der Nenner war 2500
      // und die Quote 20 statt 25 Prozent. Wer nur einen Teil seiner
      // Untermessungen zugeordnet hatte, bekam so eine zu niedrige Quote
      // ausgewiesen.
      expect(quote.gesamtKwh).toBe(2000);
      expect(quote.zugeordnetKwh).toBe(500);
      expect(quote.quotePct).toBe(25);
    });

    it('zaehlt einen beendeten Zeitraum weiter, den danach aber nicht mehr', async () => {
      const { endkundeId, systemId, foerderjahrId } = await neueSzene('Beendet');
      const haupt = await legeKanalAn(systemId, 'strom');
      const unter = await legeKanalAn(systemId, 'strom', true);
      await schreibeTageswerte(haupt.key, `${JAHR}-01-01`, 20, 100);
      await schreibeTageswerte(unter.key, `${JAHR}-01-01`, 20, 50);

      const gruppeId = await legeGruppeAn(endkundeId, 'Druckluft');
      await zuordne({
        geraetegruppeId: gruppeId,
        messkanalId: unter.id,
        methode: 'direktmessung',
        gueltigVon: `${JAHR}-01-01`,
      });
      const beendet = await request(testApp.httpServer)
        .post('/geraeteerkennung/zuordnungen/beenden')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          geraetegruppeId: gruppeId,
          messkanalId: unter.id,
          gueltigBis: `${JAHR}-01-11`,
          grund: 'Zaehler umgeklemmt',
        });
      expect(beendet.status).toBe(200);

      const quote = await holeQuote(endkundeId, foerderjahrId);

      // Die ersten 10 Tage bleiben zugeordnet — das Beenden loescht die
      // Vergangenheit nicht. Der Nenner bleibt die Hauptmessung, unabhaengig
      // davon, ob die Untermessung gerade zugeordnet ist (V0058).
      expect(quote.zugeordnetKwh).toBe(500);
      expect(quote.gesamtKwh).toBe(2000);
    });

    it('laesst eine NICHT zugeordnete Untermessung aus dem Nenner (V0058)', async () => {
      // Der Fall, den die alte Modellierung nicht kannte: Ein Unterzaehler,
      // den niemand einer Geraetegruppe zugeordnet hat. Vorher zaehlte er wie
      // eine Hauptmessung in den Nenner und druckte die Quote — obwohl sein
      // Verbrauch in der Hauptmessung ohnehin schon steckte.
      const { endkundeId, systemId, foerderjahrId } = await neueSzene('UnterOhneGruppe');
      const haupt = await legeKanalAn(systemId, 'strom');
      const unterZugeordnet = await legeKanalAn(systemId, 'strom', true);
      const unterOhneGruppe = await legeKanalAn(systemId, 'strom', true);
      await schreibeTageswerte(haupt.key, `${JAHR}-01-01`, 10, 100); // 1000
      await schreibeTageswerte(unterZugeordnet.key, `${JAHR}-01-01`, 10, 30); // 300
      await schreibeTageswerte(unterOhneGruppe.key, `${JAHR}-01-01`, 10, 40); // 400, ohne Gruppe

      const gruppeId = await legeGruppeAn(endkundeId, 'Beleuchtung');
      await zuordne({
        geraetegruppeId: gruppeId,
        messkanalId: unterZugeordnet.id,
        methode: 'direktmessung',
        gueltigVon: `${JAHR}-01-01`,
      });

      const quote = await holeQuote(endkundeId, foerderjahrId);

      // Nenner 1000 (nur die Hauptmessung), NICHT 1400.
      expect(quote.gesamtKwh).toBe(1000);
      expect(quote.zugeordnetKwh).toBe(300);
      expect(quote.quotePct).toBe(30);
    });

    it('ignoriert Tageswerte ausserhalb des Foerderjahr-Fensters', async () => {
      // `bisMonat` ist der LETZTE Monat EINSCHLIESSLICH — der Maerz zaehlt
      // also ganz, der April gar nicht.
      const { endkundeId, systemId, foerderjahrId } = await neueSzene('Fenster');
      const haupt = await legeKanalAn(systemId, 'strom');
      await schreibeTageswerte(haupt.key, `${JAHR}-03-25`, 7, 100); // 25.-31.03. = 700, drin
      await schreibeTageswerte(haupt.key, `${JAHR}-04-01`, 7, 100); // April = draussen
      await schreibeTageswerte(haupt.key, `${JAHR - 1}-12-25`, 7, 100); // Vorjahr = draussen

      const quote = await holeQuote(endkundeId, foerderjahrId);

      expect(quote.gesamtKwh).toBe(700);
    });
  });

  describe('Was die Quote ausweist', () => {
    it('rechnet den Anteil einer Zuordnung anteilig', async () => {
      const { endkundeId, systemId, foerderjahrId } = await neueSzene('Anteil');
      const haupt = await legeKanalAn(systemId, 'strom');
      const unter = await legeKanalAn(systemId, 'strom', true);
      await schreibeTageswerte(haupt.key, `${JAHR}-01-01`, 10, 100); // 1000
      await schreibeTageswerte(unter.key, `${JAHR}-01-01`, 10, 100); // 1000, davon 40 % = 400

      const gruppeId = await legeGruppeAn(endkundeId, 'Vorschaltgeraet');
      await zuordne({
        geraetegruppeId: gruppeId,
        messkanalId: unter.id,
        methode: 'vorschaltgeraet',
        genauigkeitPct: 90,
        anteilProzent: 40,
        gueltigVon: `${JAHR}-01-01`,
      });

      const quote = await holeQuote(endkundeId, foerderjahrId);

      expect(quote.zugeordnetKwh).toBe(400);
      expect(quote.gesamtKwh).toBe(1000);
      expect(quote.quotePct).toBe(40);
    });

    it('weist die Aufteilung je Gruppe aus (Kap. 6, Nutzerinformation)', async () => {
      const { endkundeId, systemId, foerderjahrId } = await neueSzene('Aufteilung');
      const haupt = await legeKanalAn(systemId, 'strom');
      const kanalA = await legeKanalAn(systemId, 'strom', true);
      const kanalB = await legeKanalAn(systemId, 'strom', true);
      await schreibeTageswerte(haupt.key, `${JAHR}-01-01`, 10, 100); // 1000
      await schreibeTageswerte(kanalA.key, `${JAHR}-01-01`, 10, 30); //  300
      await schreibeTageswerte(kanalB.key, `${JAHR}-01-01`, 10, 10); //  100

      const gruppeA = await legeGruppeAn(endkundeId, 'Beleuchtung');
      const gruppeB = await legeGruppeAn(endkundeId, 'Serverraum');
      for (const [gruppeId, kanal] of [
        [gruppeA, kanalA],
        [gruppeB, kanalB],
      ] as const) {
        await zuordne({
          geraetegruppeId: gruppeId,
          messkanalId: kanal.id,
          methode: 'direktmessung',
          gueltigVon: `${JAHR}-01-01`,
        });
      }

      const quote = await holeQuote(endkundeId, foerderjahrId);

      expect(quote.zugeordnetKwh).toBe(400);
      expect(quote.quotePct).toBe(40);
      // Absteigend nach Menge — die groesste Gruppe zuerst.
      expect(quote.gruppen).toEqual([
        { geraetegruppeId: gruppeA, bezeichnung: 'Beleuchtung', zugeordnetKwh: 300, anteilPct: 30 },
        { geraetegruppeId: gruppeB, bezeichnung: 'Serverraum', zugeordnetKwh: 100, anteilPct: 10 },
      ]);
    });

    it('haelt die Sollquote am Projektjahr fest, nicht an der Summe der Jahre', async () => {
      // „Die Erkennungsraten sind nicht kumulativ" ([Q3] Kap. 5, woertlich).
      const { endkundeId, systemId, foerderjahrId } = await neueSzene('Projektjahr5', 5);
      const haupt = await legeKanalAn(systemId, 'strom');
      const unter = await legeKanalAn(systemId, 'strom', true);
      await schreibeTageswerte(haupt.key, `${JAHR}-01-01`, 10, 100); // 1000
      await schreibeTageswerte(unter.key, `${JAHR}-01-01`, 10, 35); //  350 -> 35 %

      const gruppeId = await legeGruppeAn(endkundeId, 'Beleuchtung');
      await zuordne({
        geraetegruppeId: gruppeId,
        messkanalId: unter.id,
        methode: 'direktmessung',
        gueltigVon: `${JAHR}-01-01`,
      });

      const quote = await holeQuote(endkundeId, foerderjahrId);

      expect(quote.sollQuotePct).toBe(40);
      expect(quote.quotePct).toBe(35);
      expect(quote.erreicht).toBe(false);
    });
  });

  describe('Wann die Quote NICHT null Prozent ist, sondern unbekannt', () => {
    it('meldet fehlende Tageswerte statt einer 0', async () => {
      // Der haeufigste Grund ist, dass die Verdichtung fuer den Zeitraum noch
      // nicht gelaufen ist. Eine 0 sieht aus wie ein Ergebnis und wird als
      // eines gelesen — auch von der Bewilligungsbehoerde.
      const { endkundeId, systemId, foerderjahrId } = await neueSzene('OhneWerte');
      await legeKanalAn(systemId, 'strom');

      const quote = await holeQuote(endkundeId, foerderjahrId);

      expect(quote.ohneTageswerte).toBe(true);
      expect(quote.quotePct).toBeNull();
      expect(quote.erreicht).toBeNull();
    });
  });

  describe('Die Entbehrlichkeit steht NEBEN der Quote, nicht in ihr', () => {
    it('hebt eine verfehlte Quote NICHT auf „erfuellt"', async () => {
      // Eine Quote, die sich durch ein Haekchen von 12 % auf „erfuellt" hebt,
      // waere genau die Zahl, der niemand mehr trauen kann.
      const { endkundeId, systemId, foerderjahrId } = await neueSzene('Entbehrlich');
      const haupt = await legeKanalAn(systemId, 'strom');
      const unter = await legeKanalAn(systemId, 'strom', true);
      await schreibeTageswerte(haupt.key, `${JAHR}-01-01`, 10, 100); // 1000
      await schreibeTageswerte(unter.key, `${JAHR}-01-01`, 10, 12); //  120 -> 12 %

      const gruppeId = await legeGruppeAn(endkundeId, 'Beleuchtung');
      await zuordne({
        geraetegruppeId: gruppeId,
        messkanalId: unter.id,
        methode: 'direktmessung',
        gueltigVon: `${JAHR}-01-01`,
      });
      const vermerkt = await request(testApp.httpServer)
        .post(`/geraeteerkennung/systeme/${systemId}/entbehrlich`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ entbehrlich: true, grund: 'System umfasst nur ein Geraet.' });
      expect(vermerkt.status).toBe(204);

      const quote = await holeQuote(endkundeId, foerderjahrId);

      expect(quote.quotePct).toBe(12);
      expect(quote.erreicht).toBe(false);
      // Die Tatsache wird DANEBEN ausgewiesen — die Wuerdigung trifft ein Mensch.
      expect(quote.systemeGesamt).toBe(1);
      expect(quote.systemeEntbehrlich).toBe(1);
      expect(quote.alleSystemeEntbehrlich).toBe(true);
    });

    it('meldet Teil-Entbehrlichkeit nicht als vollstaendig', async () => {
      const { endkundeId, systemId, foerderjahrId } = await neueSzene('TeilEntbehrlich');
      await legeSystemAn(testApp, betriebToken, endkundeId, 'Zweites System');
      await request(testApp.httpServer)
        .post(`/geraeteerkennung/systeme/${systemId}/entbehrlich`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ entbehrlich: true, grund: 'Nur ein Geraet in diesem System.' });

      const quote = await holeQuote(endkundeId, foerderjahrId);

      expect(quote.systemeGesamt).toBe(2);
      expect(quote.systemeEntbehrlich).toBe(1);
      expect(quote.alleSystemeEntbehrlich).toBe(false);
    });
  });
});
