import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Client } from 'pg';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Die Systemgrenze eines Messkonzept-Energieträgers (V0072).
 *
 * **Warum das ein eigener Erfassungsweg sein muss.** Bis hierher wurde
 * `energy.messkonzept_version_energietraeger_system` ausschließlich per SQL
 * befüllt — in Testfixtures, im Demo-Generator, in Aufbau-Skripten. Fehlte
 * die Zuordnung, rechnete der Berechnungslauf trotzdem: Er nahm alle aktiven
 * Zähler des Endkunden (`endkunde_fallback`, V0062). Bei einem Kunden mit
 * mehreren Messkonzepten fließt dabei fremder Verbrauch ein, ohne dass
 * irgendwo ein Fehler erscheint.
 */
describe('Systemgrenze — Integrationstests (V0072)', () => {
  let testApp: StammdatenTestApp;
  let dbClient: Client;
  let betriebToken: string;
  let auditorToken: string;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
    betriebToken = await testApp.signToken('betrieb-grenze', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-grenze', ['compliance-auditor']);
  }, 180_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  function key(): string {
    return randomUUID();
  }

  /** Endkunde mit zwei Systemen und einem Messkonzept (Strom). */
  async function bestand(): Promise<{ endkundeId: string; mvetId: string; systemA: string; systemB: string }> {
    const endkunde = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ stammdatenPii: { name: `Grenze ${randomUUID().slice(0, 8)}`, anschrift: 'Teststrasse 1' } });
    expect(endkunde.status).toBe(201);
    const endkundeId = (endkunde.body as { id: string }).id;

    const systeme: string[] = [];
    for (const bezeichnung of ['Halle A', 'Halle B']) {
      const antwort = await request(testApp.httpServer)
        .post('/stammdaten/systeme')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', key())
        .send({ endkundeId, bezeichnung, systemgrenze: bezeichnung, systembeschreibung: 'Test' });
      expect(antwort.status).toBe(201);
      systeme.push((antwort.body as { id: string }).id);
    }

    const version = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({
        typ: 'standard',
        systemgrenze: 'Test',
        systembeschreibung: 'Test',
        bereinigungsverfahren: 'Gradtagzahlverfahren',
        messgeraeteWahl: 'Test',
        geraeteerkennungsVerfahren: 'Test',
        energietraeger: [{ energietraeger: 'strom', baselineWert: 1000, baselineEinheit: 'kWh' }],
      });
    expect(version.status).toBe(201);
    const mvetId = (version.body as { energietraeger: { mvetId: string }[] }).energietraeger[0]!.mvetId;

    return { endkundeId, mvetId, systemA: systeme[0]!, systemB: systeme[1]! };
  }

  it('gibt die mvet-Kennung im Messkonzept-Detail heraus — ohne sie ist die Grenze nicht adressierbar', async () => {
    const { mvetId } = await bestand();

    expect(mvetId).toMatch(/^[0-9a-f-]{36}$/);
  }, 120_000);

  it('meldet eine leere Grenze als FALLBACK — der Lauf naehme sonst still alle Zaehler', async () => {
    const { mvetId } = await bestand();

    const antwort = await request(testApp.httpServer)
      .get(`/stammdaten/messkonzept-energietraeger/${mvetId}/systeme`)
      .set('Authorization', `Bearer ${betriebToken}`);

    expect(antwort.status).toBe(200);
    expect(antwort.body).toMatchObject({ greiftFallback: true, energietraeger: 'strom' });
    expect((antwort.body as { systeme: unknown[] }).systeme).toHaveLength(0);
    // Die Auswahl kommt mit: Eine Oberflaeche, die eine Menge bearbeiten
    // laesst, braucht beides in einem Zug.
    expect((antwort.body as { waehlbar: unknown[] }).waehlbar).toHaveLength(2);
  }, 120_000);

  it('setzt die Grenze und meldet den Fallback danach als erledigt', async () => {
    const { mvetId, systemA } = await bestand();

    const antwort = await request(testApp.httpServer)
      .put(`/stammdaten/messkonzept-energietraeger/${mvetId}/systeme`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ systemIds: [systemA] });

    expect(antwort.status).toBe(200);
    expect(antwort.body).toMatchObject({ greiftFallback: false });
    expect((antwort.body as { systeme: { systemId: string }[] }).systeme.map((s) => s.systemId)).toEqual([systemA]);
  }, 120_000);

  it('ist idempotent — zweimal dasselbe aendert nichts', async () => {
    const { mvetId, systemA, systemB } = await bestand();
    const senden = (): request.Test =>
      request(testApp.httpServer)
        .put(`/stammdaten/messkonzept-energietraeger/${mvetId}/systeme`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', key())
        .send({ systemIds: [systemA, systemB] });

    await senden();
    const zweite = await senden();

    expect(zweite.status).toBe(200);
    expect((zweite.body as { systeme: unknown[] }).systeme).toHaveLength(2);
  }, 120_000);

  it('ERSETZT die Menge, statt zu ergaenzen', async () => {
    // Wer eine Menge setzt, meint den neuen Zustand.
    const { mvetId, systemA, systemB } = await bestand();

    await request(testApp.httpServer)
      .put(`/stammdaten/messkonzept-energietraeger/${mvetId}/systeme`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ systemIds: [systemA, systemB] });

    const antwort = await request(testApp.httpServer)
      .put(`/stammdaten/messkonzept-energietraeger/${mvetId}/systeme`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ systemIds: [systemB] });

    expect((antwort.body as { systeme: { systemId: string }[] }).systeme.map((s) => s.systemId)).toEqual([systemB]);
  }, 120_000);

  it('laesst den Weg zurueck zum Fallback offen', async () => {
    // Sonst kaeme man aus einer falsch gesetzten Grenze nicht mehr heraus.
    const { mvetId, systemA } = await bestand();

    await request(testApp.httpServer)
      .put(`/stammdaten/messkonzept-energietraeger/${mvetId}/systeme`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ systemIds: [systemA] });

    const antwort = await request(testApp.httpServer)
      .put(`/stammdaten/messkonzept-energietraeger/${mvetId}/systeme`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ systemIds: [] });

    expect(antwort.status).toBe(200);
    expect(antwort.body).toMatchObject({ greiftFallback: true });
  }, 120_000);

  it('weist ein FREMDES System ab (400) — nicht als 500 aus dem Mandanten-Fremdschluessel', async () => {
    const eigener = await bestand();
    const fremder = await bestand();

    const antwort = await request(testApp.httpServer)
      .put(`/stammdaten/messkonzept-energietraeger/${eigener.mvetId}/systeme`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ systemIds: [fremder.systemA] });

    expect(antwort.status).toBe(400);
    expect((antwort.body as { detail: string }).detail).toMatch(/nicht zu diesem Endkunden/);
  }, 120_000);

  it('weist Doppelungen ab — die Systemgrenze ist eine Menge', async () => {
    const { mvetId, systemA } = await bestand();

    const antwort = await request(testApp.httpServer)
      .put(`/stammdaten/messkonzept-energietraeger/${mvetId}/systeme`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ systemIds: [systemA, systemA] });

    expect(antwort.status).toBe(400);
  }, 120_000);

  it('laesst den Auditor lesen, aber nicht setzen', async () => {
    const { mvetId, systemA } = await bestand();

    expect(
      (
        await request(testApp.httpServer)
          .get(`/stammdaten/messkonzept-energietraeger/${mvetId}/systeme`)
          .set('Authorization', `Bearer ${auditorToken}`)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(testApp.httpServer)
          .put(`/stammdaten/messkonzept-energietraeger/${mvetId}/systeme`)
          .set('Authorization', `Bearer ${auditorToken}`)
          .set('Idempotency-Key', key())
          .send({ systemIds: [systemA] })
      ).status,
    ).toBe(403);
  }, 120_000);

  it('protokolliert die Zuordnung mit Anzahl vorher und nachher', async () => {
    // „von 0 auf 1" ist eine Ersteinrichtung, „von 5 auf 1" eine Korrektur.
    const { mvetId, systemA, systemB } = await bestand();

    await request(testApp.httpServer)
      .put(`/stammdaten/messkonzept-energietraeger/${mvetId}/systeme`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ systemIds: [systemA, systemB] });
    await request(testApp.httpServer)
      .put(`/stammdaten/messkonzept-energietraeger/${mvetId}/systeme`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ systemIds: [systemA] });

    const ereignisse = await dbClient.query<{ kontext: Record<string, unknown> }>(
      `SELECT kontext FROM audit.event
        WHERE event_typ = 'messkonzept.systemgrenze.zugeordnet' AND objekt_ref = $1`,
      [mvetId],
    );

    expect(ereignisse.rowCount).toBe(2);
    const paare = ereignisse.rows.map((r) => `${String(r.kontext['vorher_anzahl'])}->${String(r.kontext['system_anzahl'])}`);
    expect(paare).toContain('0->2');
    expect(paare).toContain('2->1');
    // Keine Systembezeichnungen im Log — sie sind Freitext (A13-Linie).
    expect(JSON.stringify(ereignisse.rows)).not.toContain('Halle');
  }, 120_000);
});
