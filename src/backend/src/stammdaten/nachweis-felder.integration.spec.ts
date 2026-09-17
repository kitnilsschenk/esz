import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { StammdatenTestApp } from './test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from './test-support/stammdaten-test-app';

/**
 * Die drei Angaben, die der Einsparungsnachweis verlangt und die bis V0074
 * im Schema fehlten: Richtung eines Messpunkts, Endkundengruppe, Standort
 * eines Systems.
 *
 * **Warum sie zusammen geprüft werden.** Sie haben keinen fachlichen Bezug
 * zueinander — sie haben denselben Anlass. Jede von ihnen war der Grund,
 * warum ein Blatt der Nachweis-Vorlage nicht befüllbar war, und keine ließ
 * sich aus Vorhandenem herleiten.
 */
describe('Nachweis-Felder aus V0074 — Integrationstests', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-nachweisfelder', ['betrieb']);
  }, 180_000);

  afterAll(async () => {
    await stopStammdatenTestApp(testApp);
  });

  function key(): string {
    return randomUUID();
  }

  async function legeEndkundeAn(zusatz: Record<string, unknown> = {}): Promise<string> {
    const antwort = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({
        stammdatenPii: { name: `Nachweis ${randomUUID().slice(0, 8)}`, anschrift: 'Teststrasse 1' },
        ...zusatz,
      });
    expect(antwort.status).toBe(201);
    return (antwort.body as { id: string }).id;
  }

  async function legeSystemAn(endkundeId: string, zusatz: Record<string, unknown> = {}): Promise<string> {
    const antwort = await request(testApp.httpServer)
      .post('/stammdaten/systeme')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ endkundeId, bezeichnung: 'Halle', systemgrenze: 'Halle', ...zusatz });
    expect(antwort.status).toBe(201);
    return (antwort.body as { id: string }).id;
  }

  async function legeStandortAn(endkundeId: string, bezeichnung: string): Promise<string> {
    const antwort = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ typ: 'liegenschaft', bezeichnung, adresse: 'Industriestrasse 1' });
    expect(antwort.status).toBe(201);
    return (antwort.body as { id: string }).id;
  }

  async function legeKanalAn(systemId: string, zusatz: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const zaehler = await request(testApp.httpServer)
      .post('/stammdaten/zaehler')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ systemId, geraetetyp: 'Testzaehler', energietraeger: 'strom' });
    expect(zaehler.status).toBe(201);

    const kanal = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${(zaehler.body as { id: string }).id}/messkanaele`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ messgroesse: 'Wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand', ...zusatz });
    expect(kanal.status).toBe(201);
    return kanal.body as Record<string, unknown>;
  }

  describe('Messkanal-Richtung', () => {
    it('setzt `bezug` als Vorgabe — der Verbrauchszaehler ist der Regelfall', async () => {
      const systemId = await legeSystemAn(await legeEndkundeAn());

      const kanal = await legeKanalAn(systemId);

      expect(kanal['richtung']).toBe('bezug');
    });

    it('nimmt Eigenerzeugung und Einspeisung an', async () => {
      const systemId = await legeSystemAn(await legeEndkundeAn());

      expect((await legeKanalAn(systemId, { richtung: 'eigenerzeugung' }))['richtung']).toBe('eigenerzeugung');
      expect((await legeKanalAn(systemId, { richtung: 'einspeisung' }))['richtung']).toBe('einspeisung');
    });

    it('weist eine unbekannte Richtung ab', async () => {
      const systemId = await legeSystemAn(await legeEndkundeAn());
      const zaehler = await request(testApp.httpServer)
        .post('/stammdaten/zaehler')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', key())
        .send({ systemId, geraetetyp: 'Testzaehler', energietraeger: 'strom' });

      const antwort = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${(zaehler.body as { id: string }).id}/messkanaele`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', key())
        .send({ messgroesse: 'Wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand', richtung: 'rueckspeisung' });

      expect(antwort.status).toBe(400);
    });

    it('laesst die Richtung korrigieren — der Migrations-Default ist eine Annahme, keine Messung', async () => {
      const systemId = await legeSystemAn(await legeEndkundeAn());
      const kanal = await legeKanalAn(systemId);

      const antwort = await request(testApp.httpServer)
        .patch(`/stammdaten/messkanaele/${String(kanal['id'])}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', key())
        .send({ richtung: 'einspeisung' });

      expect(antwort.status).toBe(200);
      expect(antwort.body).toMatchObject({ richtung: 'einspeisung' });
    });

    it('GIBT die Richtung und die Untermessung auch aus — beide waren schreibbar, aber nicht lesbar', async () => {
      // Der Vertrag fuehrte `istUntermessung` seit V0058 als Pflichtfeld der
      // Antwort, der Mapper liess es weg. Wer es gesetzt hatte, konnte es
      // nirgends nachpruefen — bei einer Angabe, deren Fehler an einem realen
      // Bestand −18 154 kWh ausmachte.
      const systemId = await legeSystemAn(await legeEndkundeAn());
      const kanal = await legeKanalAn(systemId, { istUntermessung: true, richtung: 'eigenerzeugung' });

      const detail = await request(testApp.httpServer)
        .get(`/stammdaten/messkanaele/${String(kanal['id'])}`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(detail.body).toMatchObject({ istUntermessung: true, richtung: 'eigenerzeugung' });
    });
  });

  describe('Endkundengruppe', () => {
    it('nimmt die Branche beim Anlegen an und gibt sie zurueck', async () => {
      const endkundeId = await legeEndkundeAn({ endkundengruppe: 'Kreditinstitut' });

      const detail = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(detail.body).toMatchObject({ endkundengruppe: 'Kreditinstitut' });
    });

    it('laesst sie weg — sie ist optional und bleibt dann null', async () => {
      const endkundeId = await legeEndkundeAn();

      const detail = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect((detail.body as { endkundengruppe: string | null }).endkundengruppe).toBeNull();
    });

    it('laesst sie nachtragen, ohne die PII anzufassen', async () => {
      // Der Regelfall: Der Kunde ist laengst angelegt, und die Branche wird
      // erst gebraucht, wenn der erste Nachweis ansteht.
      const endkundeId = await legeEndkundeAn();

      const antwort = await request(testApp.httpServer)
        .patch(`/stammdaten/endkunden/${endkundeId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', key())
        .send({ endkundengruppe: 'Kreditinstitut' });

      expect(antwort.status).toBe(200);
      expect(antwort.body).toMatchObject({ endkundengruppe: 'Kreditinstitut' });
      // Die PII ist unberuehrt geblieben.
      expect((antwort.body as { stammdatenPii: { name: string } }).stammdatenPii.name).toMatch(/^Nachweis /);
    });

    it('weist den Leerstring ab — sonst staenden "nicht erfasst" und "leer" nebeneinander', async () => {
      const antwort = await request(testApp.httpServer)
        .post('/stammdaten/endkunden')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', key())
        .send({ stammdatenPii: { name: 'Leer', anschrift: 'Teststrasse 1' }, endkundengruppe: '' });

      expect(antwort.status).toBe(400);
    });
  });

  describe('Standort am System', () => {
    it('nimmt den Standort beim Anlegen an', async () => {
      const endkundeId = await legeEndkundeAn();
      const standortId = await legeStandortAn(endkundeId, 'Werk Nord');

      const systemId = await legeSystemAn(endkundeId, { standortId });

      const detail = await request(testApp.httpServer)
        .get(`/stammdaten/systeme/${systemId}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(detail.body).toMatchObject({ standortId });
    });

    it('bleibt ohne Angabe null — Bestandssysteme haben keinen', async () => {
      const systemId = await legeSystemAn(await legeEndkundeAn());

      const detail = await request(testApp.httpServer)
        .get(`/stammdaten/systeme/${systemId}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect((detail.body as { standortId: string | null }).standortId).toBeNull();
    });

    it('laesst ihn nachtragen', async () => {
      const endkundeId = await legeEndkundeAn();
      const systemId = await legeSystemAn(endkundeId);
      const standortId = await legeStandortAn(endkundeId, 'Werk Sued');

      const antwort = await request(testApp.httpServer)
        .patch(`/stammdaten/systeme/${systemId}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', key())
        .send({ standortId });

      expect(antwort.status).toBe(200);
      expect(antwort.body).toMatchObject({ standortId });
    });

    it('weist einen FREMDEN Standort ab — ein Mandantenbruch waere hier still', async () => {
      // Ein einfacher FK auf `standort(id)` liesse das durch. Der
      // zusammengesetzte (standort_id, endkunde_id) haelt es auf.
      const eigener = await legeEndkundeAn();
      const fremder = await legeEndkundeAn();
      const fremderStandort = await legeStandortAn(fremder, 'Fremdes Werk');

      const antwort = await request(testApp.httpServer)
        .post('/stammdaten/systeme')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', key())
        .send({ endkundeId: eigener, bezeichnung: 'Halle', systemgrenze: 'Halle', standortId: fremderStandort });

      expect(antwort.status).toBeGreaterThanOrEqual(400);
      expect(antwort.status).toBeLessThan(500);
    });
  });
});
