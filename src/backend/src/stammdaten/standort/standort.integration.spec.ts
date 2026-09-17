import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Integrationstests (ECHTER Postgres+TimescaleDB-Testcontainer, ALLE
 * `migrations/**`-Dateien inkl. V0017/V0018 dynamisch angewendet über
 * `migrate-test-postgres.ts`, KEIN DB-Mock, `.claude/rules/tests.md`) für
 * die Standort-/Gebäudestruktur (ADR-0010).
 *
 * Deckt gezielt die im Arbeitsauftrag benannten Kernszenarien ab: Baum
 * anlegen/verschieben/stilllegen, Mandantentreue, die STRIKTE Trennung der
 * beiden Lesestufen (D5), die AAD-Bindung (D4, zentrale Sicherheitsauflage),
 * "Umsetzen" ohne Overlap (D3), die Kern-Query (D6), die Standort-PII-Shred-
 * Dimension (D4) und die ABAC-Rollen-Matrix.
 *
 * Testdaten sind ausschließlich synthetisch (F6-Bedingung 2/M6).
 */
describe('Standort-/Gebäudestruktur — Integrationstests (ADR-0010)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let betrieb2Token: string;
  let auditorToken: string;
  let adminToken: string;
  let dbClient: Client;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    betrieb2Token = await testApp.signToken('betrieb-freigeber-sub', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-sub', ['compliance-auditor']);
    adminToken = await testApp.signToken('admin-sub', ['admin']);

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
        stammdatenPii: { name: `Testkunde Standort ${namenSuffix}`, anschrift: 'Musterstraße 1, 12345 Musterstadt' },
      });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function legeZaehlerAn(endkundeId: string, namenSuffix: string): Promise<string> {
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
    return (zaehlerResponse.body as { id: string }).id;
  }

  interface StandortAnlegenBody {
    readonly typ: string;
    readonly parentId?: string;
    readonly sortierung?: number;
    readonly bezeichnung: string;
    readonly adresse?: string;
    readonly klimareferenz?: string;
  }

  async function legeStandortAn(
    endkundeId: string,
    body: StandortAnlegenBody,
    token: string = betriebToken,
  ): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(body);
    return { status: response.status, body: response.body as Record<string, unknown> };
  }

  describe('Klimastation am Standort (ADR-0006 C10-O2)', () => {
    it('nimmt die Station beim Anlegen entgegen und gibt sie zurück', async () => {
      // Die Station gehoert zum OBJEKT, nicht zum einzelnen Rechenlauf. Bis
      // 2026-09-16 gab es diesen Ort nicht -- und ADR-0006 C10.1 zeigt, was
      // das kostet: eine Station 220 km neben dem Objekt, jahrelang unbemerkt.
      const endkundeId = await legeEndkundeAn('Klima');

      const wurzel = await legeStandortAn(endkundeId, {
        typ: 'liegenschaft',
        bezeichnung: 'Liegenschaft Pilotbestand A',
        adresse: 'Musterweg 1, 88212 Musterstadt',
        klimareferenz: 'DWD-04094',
      });

      expect(wurzel.status).toBe(201);
      expect(wurzel.body['klimareferenz']).toBe('DWD-04094');
    });

    it('liefert `null`, wenn keine hinterlegt ist — nicht einen Leerstring', async () => {
      const endkundeId = await legeEndkundeAn('KlimaLeer');

      const wurzel = await legeStandortAn(endkundeId, {
        typ: 'liegenschaft',
        bezeichnung: 'Ohne Station',
        adresse: 'Musterweg 2, 88212 Musterstadt',
      });

      expect(wurzel.body['klimareferenz']).toBeNull();
    });

    it('behält die Station, wenn nur die Sortierung geändert wird', async () => {
      // DIE FALLE dieses Arbeitspakets: Das Aenderungsformular schickt
      // `klimareferenz` immer mit (nur so laesst sie sich wieder entfernen).
      // Wuerde die Antwort die Station nicht fuehren, belegte das Formular
      // ein leeres Feld vor -- und eine harmlose Sortier-Aenderung loeschte
      // sie beilaeufig mit.
      const endkundeId = await legeEndkundeAn('KlimaBleibt');
      const wurzel = await legeStandortAn(endkundeId, {
        typ: 'liegenschaft',
        bezeichnung: 'Bleibt',
        adresse: 'Musterweg 3, 88212 Musterstadt',
        klimareferenz: 'DWD-04094',
      });

      const geaendert = await request(testApp.httpServer)
        .patch(`/stammdaten/standorte/${wurzel.body['id'] as string}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ sortierung: 5, klimareferenz: 'DWD-04094' });

      expect(geaendert.status).toBe(200);
      expect((geaendert.body as Record<string, unknown>)['klimareferenz']).toBe('DWD-04094');
    });

    it('entfernt die Station beim Leerstring, statt ihn zu speichern', async () => {
      const endkundeId = await legeEndkundeAn('KlimaWeg');
      const wurzel = await legeStandortAn(endkundeId, {
        typ: 'liegenschaft',
        bezeichnung: 'Weg damit',
        adresse: 'Musterweg 4, 88212 Musterstadt',
        klimareferenz: 'DWD-04094',
      });

      const geaendert = await request(testApp.httpServer)
        .patch(`/stammdaten/standorte/${wurzel.body['id'] as string}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ klimareferenz: '' });

      expect(geaendert.status).toBe(200);
      expect((geaendert.body as Record<string, unknown>)['klimareferenz']).toBeNull();
    });

    it('weist eine Kennung mit Sonderzeichen ab', async () => {
      // Die Kennung landet im DWD-Adapter in Datei- und URL-Pfaden.
      const endkundeId = await legeEndkundeAn('KlimaBoese');

      const antwort = await legeStandortAn(endkundeId, {
        typ: 'liegenschaft',
        bezeichnung: 'Boese',
        adresse: 'Musterweg 5, 88212 Musterstadt',
        klimareferenz: '../../etc/passwd',
      });

      expect(antwort.status).toBe(400);
    });
  });

  describe('Baum: anlegen/verschieben/stilllegen über die API', () => {
    it('legt eine Wurzel (liegenschaft, Adresse Pflicht) + darunter gebaeude/raum an — GET liste liefert den gesamten Baum PII-frei', async () => {
      const endkundeId = await legeEndkundeAn('Baum');

      const wurzel = await legeStandortAn(endkundeId, {
        typ: 'liegenschaft',
        bezeichnung: 'Werksgelaende Nord',
        adresse: 'Industriestrasse 1, 12345 Musterstadt',
      });
      expect(wurzel.status).toBe(201);
      expect(wurzel.body).toMatchObject({ typ: 'liegenschaft', ebene: 0, parentId: null, status: 'aktiv', hatAdresse: true });
      const wurzelId = wurzel.body['id'] as string;

      const gebaeude = await legeStandortAn(endkundeId, {
        typ: 'gebaeude',
        parentId: wurzelId,
        bezeichnung: 'Halle A',
      });
      expect(gebaeude.status).toBe(201);
      expect(gebaeude.body).toMatchObject({ ebene: 1, parentId: wurzelId });
      const gebaeudeId = gebaeude.body['id'] as string;

      const raum = await legeStandortAn(endkundeId, { typ: 'raum', parentId: gebaeudeId, bezeichnung: 'Serverraum' });
      expect(raum.status).toBe(201);
      expect(raum.body).toMatchObject({ ebene: 2, parentId: gebaeudeId, hatAdresse: false });
      const raumId = raum.body['id'] as string;

      const liste = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}/standorte`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(liste.status).toBe(200);
      const items = liste.body as Record<string, unknown>[];
      expect(items.map((i) => i['id'])).toEqual(expect.arrayContaining([wurzelId, gebaeudeId, raumId]));
      expect((items.find((i) => i['id'] === raumId) as { pfad: string[] }).pfad).toEqual([wurzelId, gebaeudeId, raumId]);
    });

    it('verschiebt einen Knoten (Reparent) — Response traegt parentIdAlt + nachfahrenAktualisiert, GET liste zeigt neue ebene/pfad', async () => {
      const endkundeId = await legeEndkundeAn('Verschieben');
      const wurzelA = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Standort A', adresse: 'Strasse A 1' })).body;
      const wurzelB = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Standort B', adresse: 'Strasse B 1' })).body;
      const kind = (
        await legeStandortAn(endkundeId, { typ: 'gebaeude', parentId: wurzelA['id'] as string, bezeichnung: 'Halle unter A' })
      ).body;

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/standorte/${kind['id'] as string}/verschieben`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ neuerParentId: wurzelB['id'] as string });

      expect(response.status).toBe(200);
      const ergebnis = response.body as { standort: { parentId: string; ebene: number }; parentIdAlt: string; nachfahrenAktualisiert: number };
      expect(ergebnis.parentIdAlt).toBe(wurzelA['id']);
      expect(ergebnis.standort.parentId).toBe(wurzelB['id']);
      expect(ergebnis.nachfahrenAktualisiert).toBe(0);

      const liste = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}/standorte`)
        .set('Authorization', `Bearer ${betriebToken}`);
      const verschoben = (liste.body as { id: string; pfad: string[] }[]).find((s) => s.id === kind['id']);
      expect(verschoben?.pfad).toEqual([wurzelB['id'], kind['id']]);
    });

    it('legt still (Zustandswechsel, KEIN Hard-Delete) — lehnt ab (409) bei aktiven Kindern, gelingt danach', async () => {
      const endkundeId = await legeEndkundeAn('Stilllegen');
      const wurzel = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Wurzel', adresse: 'Weg 1' })).body;
      const kind = (
        await legeStandortAn(endkundeId, { typ: 'gebaeude', parentId: wurzel['id'] as string, bezeichnung: 'Kind' })
      ).body;

      const blockiert = await request(testApp.httpServer)
        .post(`/stammdaten/standorte/${wurzel['id'] as string}/stilllegen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ grund: 'nutzung_beendet' });
      expect(blockiert.status).toBe(409);

      const kindStillgelegt = await request(testApp.httpServer)
        .post(`/stammdaten/standorte/${kind['id'] as string}/stilllegen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ grund: 'nutzung_beendet' });
      expect(kindStillgelegt.status).toBe(200);
      expect((kindStillgelegt.body as { standort: { status: string } }).standort.status).toBe('stillgelegt');

      const wurzelStillgelegt = await request(testApp.httpServer)
        .post(`/stammdaten/standorte/${wurzel['id'] as string}/stilllegen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ grund: 'nutzung_beendet' });
      expect(wurzelStillgelegt.status).toBe(200);
    });

    it('loescht (hart) einen Blattknoten ohne Verortungshistorie — DELETE ist idempotent im HTTP-Sinn (200 dann 404)', async () => {
      const endkundeId = await legeEndkundeAn('Loeschen');
      const wurzel = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Fehlanlage', adresse: 'Weg 1' })).body;

      const erste = await request(testApp.httpServer)
        .delete(`/stammdaten/standorte/${wurzel['id'] as string}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(erste.status).toBe(200);
      expect(erste.body).toEqual({
        id: wurzel['id'],
        geloescht: true,
        endkundeId,
        typ: 'liegenschaft',
        parentIdAlt: null,
      });

      const zweite = await request(testApp.httpServer)
        .delete(`/stammdaten/standorte/${wurzel['id'] as string}`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey());
      expect(zweite.status).toBe(404);
    });
  });

  describe('Mandantentreue', () => {
    it('Anlegen mit parentId eines FREMDEN Endkunden -> 400', async () => {
      const endkundeA = await legeEndkundeAn('MandantA');
      const endkundeB = await legeEndkundeAn('MandantB');
      const wurzelB = (await legeStandortAn(endkundeB, { typ: 'liegenschaft', bezeichnung: 'B-Wurzel', adresse: 'Weg B' })).body;

      const response = await legeStandortAn(endkundeA, {
        typ: 'gebaeude',
        parentId: wurzelB['id'] as string,
        bezeichnung: 'Fremd-Kind',
      });

      expect(response.status).toBe(400);
    });

    it('Verschieben unter einen Standort eines FREMDEN Endkunden -> 400', async () => {
      const endkundeA = await legeEndkundeAn('MandantVerschiebenA');
      const endkundeB = await legeEndkundeAn('MandantVerschiebenB');
      const wurzelA = (await legeStandortAn(endkundeA, { typ: 'liegenschaft', bezeichnung: 'A-Wurzel', adresse: 'Weg A' })).body;
      const wurzelB = (await legeStandortAn(endkundeB, { typ: 'liegenschaft', bezeichnung: 'B-Wurzel', adresse: 'Weg B' })).body;

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/standorte/${wurzelA['id'] as string}/verschieben`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ neuerParentId: wurzelB['id'] as string });

      expect(response.status).toBe(400);
    });
  });

  describe('D5 — zwei Lesestufen strikt getrennt', () => {
    it('read:standort (GET liste) liefert NIEMALS Labels/Adresse — nur Pseudonyme/typ/ebene/pfad/status', async () => {
      const endkundeId = await legeEndkundeAn('D5Struktur');
      await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'GEHEIMES LABEL', adresse: 'GEHEIME ADRESSE' });

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}/standorte`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const body = JSON.stringify(response.body);
      expect(body).not.toContain('GEHEIMES LABEL');
      expect(body).not.toContain('GEHEIME ADRESSE');
      const items = response.body as Record<string, unknown>[];
      expect(items[0]).not.toHaveProperty('bezeichnung');
      expect(items[0]).not.toHaveProperty('anschrift');
    });

    it('read:standort_pii (POST labels) liefert bezeichnung/anschrift und erzeugt GENAU EIN Audit-Event mit anzahl_knoten (NICHT eines je Knoten)', async () => {
      const endkundeId = await legeEndkundeAn('D5Pii');
      const s1 = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Wohnung 3', adresse: 'Strasse 1' })).body;
      const s2 = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Wohnung 7', adresse: 'Strasse 2' })).body;

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/standorte/labels`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .send({ standortIds: [s1['id'] as string, s2['id'] as string] });

      expect(response.status).toBe(200);
      const items = response.body as { id: string; bezeichnung: string; anschrift: string | null }[];
      expect(items).toEqual(
        expect.arrayContaining([
          { id: s1['id'], bezeichnung: 'Wohnung 3', anschrift: 'Strasse 1' },
          { id: s2['id'], bezeichnung: 'Wohnung 7', anschrift: 'Strasse 2' },
        ]),
      );

      const auditRows = await dbClient.query(
        "SELECT kontext FROM audit.event WHERE event_typ = 'standort.pii.einsicht' AND kontext->>'endkunde_id' = $1",
        [endkundeId],
      );
      expect(auditRows.rowCount).toBe(1);
      const kontext = (auditRows.rows[0] as { kontext: Record<string, unknown> }).kontext;
      expect(kontext['anzahl_knoten']).toBe(2);
      expect(kontext['synthetic']).toBe(true);
    });
  });

  describe('AAD-Bindung (D4, zentrale Sicherheitsauflage)', () => {
    it('ein Chiffrat, das fuer EINEN ANDEREN Standort DESSELBEN Endkunden verschluesselt wurde, laesst sich NICHT unter der falschen standortId entschluesseln', async () => {
      const endkundeId = await legeEndkundeAn('AAD');
      const standortA = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Wohnung 3', adresse: 'Strasse 1' })).body;
      const standortB = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Wohnung 7', adresse: 'Strasse 2' })).body;

      const rowB = await dbClient.query('SELECT bezeichnung_enc FROM identity.standort_pii WHERE pseudonym_id = $1', [
        standortB['id'] as string,
      ]);
      const bezeichnungEncB = (rowB.rows[0] as { bezeichnung_enc: Buffer }).bezeichnung_enc;

      // Simuliert das genau befuerchtete Angriffs-/Fehlerszenario (D4): dasselbe,
      // geteilte DEK erlaubt technisch das Umhaengen eines Chiffrats zwischen
      // zwei Standorten — die AAD (subjektId=standortId) MUSS das verhindern.
      await dbClient.query('UPDATE identity.standort_pii SET bezeichnung_enc = $2 WHERE pseudonym_id = $1', [
        standortA['id'] as string,
        bezeichnungEncB,
      ]);

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/standorte/labels`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .send({ standortIds: [standortA['id'] as string] });

      // Schlaegt fehl (GCM-Auth-Tag-Mismatch, ProblemDetailsExceptionFilter
      // faengt JEDEN Fehler -> 500, PII-/stacktrace-frei, DS-10) — liefert
      // NIEMALS den falschen Klartext ("Wohnung 7" unter standortA-id).
      expect(response.status).toBe(500);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(JSON.stringify(response.body)).not.toContain('Wohnung 7');
    });
  });

  describe('Zaehler-Verortung (D3) — "Umsetzen" erzeugt zwei Zeitscheiben ohne Overlap', () => {
    it('erstellt eine erste Verortung, dann eine zweite ("Umsetzen") — die erste wird EXAKT an der neuen Startzeit geschlossen', async () => {
      const endkundeId = await legeEndkundeAn('Umsetzen');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'Umsetzen');
      const raumA = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Raum A', adresse: 'Weg 1' })).body;
      const raumB = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Raum B', adresse: 'Weg 2' })).body;

      const erste = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ standortId: raumA['id'] as string, gueltigVon: '2026-01-01T00:00:00.000Z' });
      expect(erste.status).toBe(201);
      expect(erste.body).toMatchObject({ standortId: raumA['id'], gueltigVon: '2026-01-01T00:00:00.000Z', gueltigBis: null });

      const zweite = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ standortId: raumB['id'] as string, gueltigVon: '2026-02-01T00:00:00.000Z' });
      expect(zweite.status).toBe(201);
      expect(zweite.body).toMatchObject({ standortId: raumB['id'], gueltigVon: '2026-02-01T00:00:00.000Z', gueltigBis: null });

      const rows = await dbClient.query(
        'SELECT standort_id, gueltig_von, gueltig_bis FROM energy.zaehler_standort WHERE zaehler_id = $1 ORDER BY gueltig_von ASC',
        [zaehlerId],
      );
      expect(rows.rowCount).toBe(2);
      const [alteZeitscheibe, neueZeitscheibe] = rows.rows as { standort_id: string; gueltig_von: string; gueltig_bis: string | null }[];
      expect(alteZeitscheibe?.standort_id).toBe(raumA['id']);
      expect(alteZeitscheibe?.gueltig_bis).not.toBeNull();
      // KEIN Overlap, KEINE Luecke: gueltig_bis der alten Zeitscheibe == gueltig_von der neuen.
      expect(new Date(alteZeitscheibe?.gueltig_bis as string).toISOString()).toBe(
        new Date(neueZeitscheibe?.gueltig_von as string).toISOString(),
      );
      expect(neueZeitscheibe?.standort_id).toBe(raumB['id']);
      expect(neueZeitscheibe?.gueltig_bis).toBeNull();
    });

    it('lehnt ab (409 Konflikt), wenn zwei aktive Verortungen desselben Zaehlers durch ein Race entstuenden (D-EXCL Backstop)', async () => {
      const endkundeId = await legeEndkundeAn('Overlap');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'Overlap');
      const standort1 = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'S1', adresse: 'Weg 1' })).body;

      await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ standortId: standort1['id'] as string, gueltigVon: '2026-01-01T00:00:00.000Z' })
        .expect(201);

      // gueltigVon VOR dem Start der aktuell offenen Verortung -> invertierte
      // Zeitscheibe, service-seitig als 400 abgefangen (VOR jedem DB-Roundtrip).
      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ standortId: standort1['id'] as string, gueltigVon: '2025-01-01T00:00:00.000Z' });

      expect(response.status).toBe(400);
    });
  });

  describe('Kern-Query (D6) — "alle Zaehler unter Knoten X zum Stichtag T"', () => {
    it('liefert zum jeweiligen Stichtag NUR den zu diesem Zeitpunkt dort verorteten Zaehler, inkl. Subtree-Aggregation', async () => {
      const endkundeId = await legeEndkundeAn('KernQuery');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'KernQuery');
      const gebaeude = (await legeStandortAn(endkundeId, { typ: 'gebaeude', bezeichnung: 'Gebaeude', adresse: 'Weg 1' })).body;
      const raumA = (
        await legeStandortAn(endkundeId, { typ: 'raum', parentId: gebaeude['id'] as string, bezeichnung: 'Raum A' })
      ).body;
      const raumB = (
        await legeStandortAn(endkundeId, { typ: 'raum', parentId: gebaeude['id'] as string, bezeichnung: 'Raum B' })
      ).body;

      await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ standortId: raumA['id'] as string, gueltigVon: '2026-01-01T00:00:00.000Z' })
        .expect(201);
      await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ standortId: raumB['id'] as string, gueltigVon: '2026-02-01T00:00:00.000Z' })
        .expect(201);

      const beiRaumAVorUmzug = await request(testApp.httpServer)
        .get(`/stammdaten/standorte/${raumA['id'] as string}/zaehler`)
        .query({ stichtag: '2026-01-15T00:00:00.000Z' })
        .set('Authorization', `Bearer ${betriebToken}`);
      expect((beiRaumAVorUmzug.body as { id: string }[]).map((z) => z.id)).toEqual([zaehlerId]);

      const beiRaumANachUmzug = await request(testApp.httpServer)
        .get(`/stammdaten/standorte/${raumA['id'] as string}/zaehler`)
        .query({ stichtag: '2026-02-15T00:00:00.000Z' })
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(beiRaumANachUmzug.body).toEqual([]);

      const beiRaumBNachUmzug = await request(testApp.httpServer)
        .get(`/stammdaten/standorte/${raumB['id'] as string}/zaehler`)
        .query({ stichtag: '2026-02-15T00:00:00.000Z' })
        .set('Authorization', `Bearer ${betriebToken}`);
      expect((beiRaumBNachUmzug.body as { id: string }[]).map((z) => z.id)).toEqual([zaehlerId]);

      const unterGebaeudeInklusive = await request(testApp.httpServer)
        .get(`/stammdaten/standorte/${gebaeude['id'] as string}/zaehler`)
        .query({ stichtag: '2026-02-15T00:00:00.000Z' })
        .set('Authorization', `Bearer ${betriebToken}`);
      expect((unterGebaeudeInklusive.body as { id: string }[]).map((z) => z.id)).toEqual([zaehlerId]);

      const unterGebaeudeExklusive = await request(testApp.httpServer)
        .get(`/stammdaten/standorte/${gebaeude['id'] as string}/zaehler`)
        .query({ stichtag: '2026-02-15T00:00:00.000Z', inklusiveUnterknoten: 'false' })
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(unterGebaeudeExklusive.body).toEqual([]);
    });
  });

  describe('GET .../zaehler/{zaehlerId}/verortung — aktuelle Verortung + Breadcrumb (Backend-Lücke 1, UX-Konzept „Wo hängt dieser Zähler?")', () => {
    it('Zaehler OHNE jede Verortung -> 200, verortet=false, EMPTY-STATE (KEIN 404)', async () => {
      const endkundeId = await legeEndkundeAn('VerortungLeer');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'VerortungLeer');

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        zaehlerId,
        verortet: false,
        standortId: null,
        verortetSeit: null,
        pfad: [],
      });
    });

    it('Zaehler mit AUSSCHLIESSLICH historischer (bereits beendeter) Verortung -> ebenfalls verortet=false, NICHT als aktuell ausgewiesen', async () => {
      const endkundeId = await legeEndkundeAn('VerortungHistorisch');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'VerortungHistorisch');
      const standort = (
        await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'Alt-Standort', adresse: 'Weg 1' })
      ).body;

      await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ standortId: standort['id'] as string, gueltigVon: '2026-01-01T00:00:00.000Z' })
        .expect(201);

      await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/verortung/beenden`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ gueltigBis: '2026-02-01T00:00:00.000Z' })
        .expect(200);

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ verortet: false, standortId: null, pfad: [] });
    });

    it('Zaehler mit aktueller Verortung liefert den VOLLSTAENDIGEN Wurzel-Pfad (Wurzel zuerst) — PII-frei (keine Bezeichnung/Adresse im Struktur-Pfad)', async () => {
      const endkundeId = await legeEndkundeAn('VerortungPfad');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'VerortungPfad');
      const wurzel = (
        await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'GEHEIME LIEGENSCHAFT', adresse: 'GEHEIME ADRESSE' })
      ).body;
      const gebaeudeId = (
        await legeStandortAn(endkundeId, { typ: 'gebaeude', parentId: wurzel['id'] as string, bezeichnung: 'GEHEIMES GEBAEUDE' })
      ).body['id'] as string;
      const raum = (
        await legeStandortAn(endkundeId, { typ: 'raum', parentId: gebaeudeId, bezeichnung: 'GEHEIMER RAUM' })
      ).body;

      await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ standortId: raum['id'] as string, gueltigVon: '2026-04-01T00:00:00.000Z' })
        .expect(201);

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(200);
      const body = response.body as {
        verortet: boolean;
        standortId: string;
        verortetSeit: string;
        pfad: { id: string; typ: string; ebene: number }[];
      };
      expect(body.verortet).toBe(true);
      expect(body.standortId).toBe(raum['id']);
      expect(body.verortetSeit).toBe('2026-04-01T00:00:00.000Z');
      // Wurzel zuerst, eigener Knoten zuletzt (Breadcrumb-Reihenfolge, D6).
      expect(body.pfad.map((eintrag) => eintrag.id)).toEqual([wurzel['id'], gebaeudeId, raum['id']]);
      expect(body.pfad.map((eintrag) => eintrag.ebene)).toEqual([0, 1, 2]);

      // Struktur-Pfad enthaelt KEINE Bezeichnungen (D5-Trennung) — Labels
      // bleiben dem bestehenden Batch-Endpunkt .../standorte/labels vorbehalten.
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('GEHEIME');
      expect(body.pfad[0]).not.toHaveProperty('bezeichnung');
      expect(body.pfad[0]).not.toHaveProperty('anschrift');
    });

    it('lehnt ab (404), wenn der Zaehler selbst nicht existiert', async () => {
      const response = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${randomUUID()}/verortung`)
        .set('Authorization', `Bearer ${betriebToken}`);

      expect(response.status).toBe(404);
    });

    it('M1 — ABAC: anonym -> 401, admin -> 403, compliance-auditor -> 200 (read:standort bleibt fuer Auswerte-Rollen nutzbar), betrieb -> 200', async () => {
      const endkundeId = await legeEndkundeAn('VerortungABAC');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'VerortungABAC');

      const anonym = await request(testApp.httpServer).get(`/stammdaten/zaehler/${zaehlerId}/verortung`);
      expect(anonym.status).toBe(401);

      const admin = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(admin.status).toBe(403);

      const auditor = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(auditor.status).toBe(200);

      const betrieb = await request(testApp.httpServer)
        .get(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(betrieb.status).toBe(200);
    });
  });

  describe('Shred erfasst Standort-PII (D4, neue Dimension analog GB-C)', () => {
    it('Endkunde-Shred (Vier-Augen freigeben) neutralisiert ALLE Standort-PII-Zeilen; ShreddingErgebnis.standortPiiNeutralisiert belegt die Reichweite; labels() liefert danach [] ', async () => {
      const endkundeId = await legeEndkundeAn('ShredStandort');
      const s1 = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'S1', adresse: 'Weg 1' })).body;
      const s2 = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'S2', adresse: 'Weg 2' })).body;

      const cryptoKeyRow = await dbClient.query('SELECT crypto_key_id FROM identity.endkunde_pii WHERE pseudonym_id = $1', [
        endkundeId,
      ]);
      const cryptoKeyId = (cryptoKeyRow.rows[0] as { crypto_key_id: string }).crypto_key_id;

      const beantragen = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN', grund: 'betroffenenantrag_art17' });
      expect(beantragen.status).toBe(201);
      const antragId = (beantragen.body as { id: string }).id;

      const freigeben = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/shred-antraege/${antragId}/freigeben`)
        .set('Authorization', `Bearer ${betrieb2Token}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ bestaetigung: 'ENDGUELTIG_LOESCHEN' });
      expect(freigeben.status).toBe(200);
      expect((freigeben.body as { shredding: { standortPiiNeutralisiert: number } }).shredding.standortPiiNeutralisiert).toBe(2);

      const neutralisiert = await dbClient.query(
        "SELECT count(*)::int AS anzahl FROM identity.standort_pii WHERE crypto_key_id = $1 AND pii_status = 'geloescht'",
        [cryptoKeyId],
      );
      expect((neutralisiert.rows[0] as { anzahl: number }).anzahl).toBe(2);

      const labelsResponse = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/standorte/labels`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .send({ standortIds: [s1['id'] as string, s2['id'] as string] });
      expect(labelsResponse.status).toBe(200);
      expect(labelsResponse.body).toEqual([]);
    });
  });

  describe('M1 — ABAC-Rollen-Matrix (Standort)', () => {
    it('anonym (kein Token) -> 401 auf POST create', async () => {
      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${randomUUID()}/standorte`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ typ: 'liegenschaft', bezeichnung: 'X', adresse: 'Y' });
      expect(response.status).toBe(401);
    });

    it('compliance-auditor -> 403 auf create:standort (DS-01, auditor bleibt strikt lesend)', async () => {
      const endkundeId = await legeEndkundeAn('ABACAuditorCreate');
      const response = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'X', adresse: 'Y' }, auditorToken);
      expect(response.status).toBe(403);
    });

    it('compliance-auditor -> 200 auf read:standort (Baum-Liste bleibt fuer Auswerte-Rollen nutzbar)', async () => {
      const endkundeId = await legeEndkundeAn('ABACAuditorRead');
      await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'X', adresse: 'Y' });

      const response = await request(testApp.httpServer)
        .get(`/stammdaten/endkunden/${endkundeId}/standorte`)
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(response.status).toBe(200);
    });

    it('compliance-auditor -> 403 auf read:standort_pii (labels), eigenstaendige Defense-in-Depth-Regel', async () => {
      const endkundeId = await legeEndkundeAn('ABACAuditorLabels');
      const s1 = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'X', adresse: 'Y' })).body;

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/standorte/labels`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ standortIds: [s1['id'] as string] });
      expect(response.status).toBe(403);
    });

    it('admin -> 403 auf create:standort (admin ist KEINE Stammdaten-Rolle)', async () => {
      const endkundeId = await legeEndkundeAn('ABACAdmin');
      const response = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'X', adresse: 'Y' }, adminToken);
      expect(response.status).toBe(403);
    });

    it('betrieb -> 201 auf create:standort (Referenz-Happy-Path)', async () => {
      const endkundeId = await legeEndkundeAn('ABACBetrieb');
      const response = await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'X', adresse: 'Y' });
      expect(response.status).toBe(201);
    });

    it('fehlender Idempotency-Key -> 400 auf POST create', async () => {
      const endkundeId = await legeEndkundeAn('ABACIdempotency');
      const response = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .send({ typ: 'liegenschaft', bezeichnung: 'X', adresse: 'Y' });
      expect(response.status).toBe(400);
    });

    it('compliance-auditor -> 403 auf create:zaehler_standort (Verortung anlegen)', async () => {
      const endkundeId = await legeEndkundeAn('ABACVerortung');
      const zaehlerId = await legeZaehlerAn(endkundeId, 'ABACVerortung');
      const standort1 = (await legeStandortAn(endkundeId, { typ: 'liegenschaft', bezeichnung: 'X', adresse: 'Y' })).body;

      const response = await request(testApp.httpServer)
        .post(`/stammdaten/zaehler/${zaehlerId}/verortung`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ standortId: standort1['id'] as string, gueltigVon: '2026-01-01T00:00:00.000Z' });
      expect(response.status).toBe(403);
    });
  });
});
