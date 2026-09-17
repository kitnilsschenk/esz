import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import request from 'supertest';
import type { StammdatenTestApp } from '../../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../../stammdaten/test-support/stammdaten-test-app';
import {
  berechnungslaufBody,
  betriebSecurityContext,
  idempotencyKey,
  legeEndkundeAn,
  legeMvetAn,
  legeSystemAn,
  mitTransaktion,
  neuesTestJahr,
  starteBerechnungslauf,
  verknuepfeMvetMitSystem,
} from '../test-support/nachweis-test-fixtures';
import { PreflightService } from '../preflight.service';
import { EinsparlaufService } from '../einsparlauf.service';
import { fensterAusMonaten, NachweisFoerderjahrRepository } from '../persistence/nachweis-foerderjahr.repository';
import type { EinsparlaufAntwort } from '../einsparlauf.types';

/**
 * Seit der A-1-Freigabe (2026-09-09) ohne Modul-Mock: `FJ-08` feuert nicht
 * mehr, weil der DWD-Quellenvermerk kein Platzhalter mehr ist. Die
 * Attributions-Prüfung unten (`dwdAttributionErforderlich`) läuft damit gegen
 * den ECHTEN Text — und zeigt weiterhin, dass die Attribution bei
 * synthetischem Klima UNTERBLEIBT (A20).
 */

describe('Nachweis-Export/Einreichung — Stufe 2 (ADR-0007 D5/D6/D7/B10, Teil C A13/A19/A20/A23)', () => {
  let testApp: StammdatenTestApp;
  let dbClient: Client;
  let betriebToken: string;
  let auditorToken: string;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
    betriebToken = await testApp.signToken('betrieb-export-sub', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-export-sub', ['compliance-auditor']);
  }, 120_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  /** Legt Foerderjahr + gruenen Preflight + Einsparlauf (art=foerderjahr_nachweis, synthetic=false) an — Muster `preflight-gruen.integration.spec.ts`. */
  async function legeGruenenEinsparlaufAn(jahr: number, suffix: string): Promise<{ readonly foerderjahrId: string; readonly endkundeId: string; readonly berechnungslaufId: string; readonly lauf: EinsparlaufAntwort }> {
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, suffix);
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
    const laufResponse = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetId, jahr));
    expect(laufResponse.status).toBe(201);
    const berechnungslaufId = laufResponse.body['id'] as string;

    const foerderjahrId = await mitTransaktion(testApp, async () => {
      const repo = testApp.app.get(NachweisFoerderjahrRepository);
      const fj = await repo.insert({
        id: randomUUID(),
        code: `FJ-EXPORT-${suffix}`,
        vorhabenRef: 'AZ-TEST-EXPORT',
        nummer: 1,
        ...fensterAusMonaten(`${jahr}-01-01`, `${jahr}-01-01`),
        definitionQuelle: 'kalenderjahr',
        bescheidRef: null,
      });
      return fj.id;
    });

    const preflightService = testApp.app.get(PreflightService);
    const preflight = await mitTransaktion(testApp, () =>
      preflightService.ausfuehren({ foerderjahrId, profilCode: 'foerderjahr_preflight_de02' }, betriebSecurityContext(), false),
    );
    expect(preflight.preflight.ergebnis).toBe('gruen');

    const einsparlaufService = testApp.app.get(EinsparlaufService);
    const lauf = await mitTransaktion(testApp, () =>
      einsparlaufService.starten({ foerderjahrId, preflightId: preflight.preflight.id, art: 'foerderjahr_nachweis' }, betriebSecurityContext(), false),
    );

    return { foerderjahrId, endkundeId, berechnungslaufId, lauf };
  }

  /**
   * Analog `legeGruenenEinsparlaufAn()`, ZUSAETZLICH mit einer aufloesbaren
   * mvet<->System-Kette (V0028, `verknuepfeMvetMitSystem`) OHNE jede
   * Anschlussnutzer-Sperre — der Preflight fuehrt daher KEIN `FJ-10`
   * (ADR-0007 A12): die Kategorie `rohdaten` MUSS im Export erscheinen.
   */
  async function legeGruenenEinsparlaufMitAufloesbarerKetteAn(jahr: number, suffix: string): Promise<{ readonly lauf: EinsparlaufAntwort }> {
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, suffix);
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
    const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, `System-${suffix}`);
    await verknuepfeMvetMitSystem(dbClient, mvetId, systemId);
    const laufResponse = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetId, jahr));
    expect(laufResponse.status).toBe(201);

    const foerderjahrId = await mitTransaktion(testApp, async () => {
      const repo = testApp.app.get(NachweisFoerderjahrRepository);
      const fj = await repo.insert({
        id: randomUUID(),
        code: `FJ-EXPORT-KETTE-${suffix}`,
        vorhabenRef: 'AZ-TEST-EXPORT',
        nummer: 1,
        ...fensterAusMonaten(`${jahr}-01-01`, `${jahr}-01-01`),
        definitionQuelle: 'kalenderjahr',
        bescheidRef: null,
      });
      return fj.id;
    });

    const preflightService = testApp.app.get(PreflightService);
    const preflight = await mitTransaktion(testApp, () =>
      preflightService.ausfuehren({ foerderjahrId, profilCode: 'foerderjahr_preflight_de02' }, betriebSecurityContext(), false),
    );
    expect(preflight.preflight.ergebnis).toBe('gruen');
    expect(preflight.befunde.some((b) => b.regelCode === 'FJ-10')).toBe(false);

    const einsparlaufService = testApp.app.get(EinsparlaufService);
    const lauf = await mitTransaktion(testApp, () =>
      einsparlaufService.starten({ foerderjahrId, preflightId: preflight.preflight.id, art: 'foerderjahr_nachweis' }, betriebSecurityContext(), false),
    );
    return { lauf };
  }

  it('ADR-0007 A12/FJ-10: rohdaten_messwert_tag.csv erscheint im Export, wenn die mvet<->System-Kette aufloesbar ist (V0028) und keine Anschlussnutzer-Sperre vorliegt', async () => {
    const jahr = neuesTestJahr();
    const { lauf } = await legeGruenenEinsparlaufMitAufloesbarerKetteAn(jahr, `RD1-${jahr}`);

    const response = await request(testApp.httpServer)
      .post(`/nachweis/einsparlaeufe/${lauf.id}/exporte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    expect(response.status).toBe(201);
    const exportId = (response.body as { id: string }).id;
    const dateien = (response.body as { dateien: { dateiname: string; kategorie: string }[] }).dateien;
    expect(dateien.map((d) => d.dateiname)).toContain('rohdaten_messwert_tag.csv');
    expect(dateien.find((d) => d.dateiname === 'rohdaten_messwert_tag.csv')).toMatchObject({ kategorie: 'rohdaten' });

    const metablattDatei = await request(testApp.httpServer)
      .get(`/nachweis/exporte/${exportId}/dateien/metablatt.csv`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(metablattDatei.status).toBe(200);
    expect(metablattDatei.text).toContain('kategorie_rohdaten_status,enthalten');
  });

  it('erzeugt einen Export mit dem korrekten Dateibuendel (OHNE rohdaten, A12/FJ-10 — legeGruenenEinsparlaufAn() legt KEINE mvet<->System-Zuordnung an) und pseudonymisiertem Endkunden', async () => {
    const jahr = neuesTestJahr();
    const { endkundeId, lauf } = await legeGruenenEinsparlaufAn(jahr, `E1-${jahr}`);

    const response = await request(testApp.httpServer)
      .post(`/nachweis/einsparlaeufe/${lauf.id}/exporte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    expect(response.status).toBe(201);
    const exportId = (response.body as { id: string }).id;
    const dateien = (response.body as { dateien: { dateiname: string; kategorie: string }[] }).dateien;
    const dateinamen = dateien.map((d) => d.dateiname);

    expect(dateinamen).not.toContain('rohdaten_messwert_tag.csv');
    expect(dateinamen).toEqual(
      expect.arrayContaining(['baseline_lauf.csv', 'baseline_klima_tag.csv', 'einflussgroessen_intervall.csv', 'einspardaten_monat.csv', 'einspardaten_jahr.csv', 'metablatt.csv', 'manifest.csv']),
    );

    // A19 — kein internes Endkunden-UUID im ausgelieferten Datei-Inhalt, stattdessen ein EK-Pseudonym.
    const jahrDatei = await request(testApp.httpServer)
      .get(`/nachweis/exporte/${exportId}/dateien/einspardaten_jahr.csv`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(jahrDatei.status).toBe(200);
    expect(jahrDatei.headers['content-type']).toContain('text/csv');
    expect(jahrDatei.text).toMatch(/EK-\d{4}/);
    expect(jahrDatei.text).not.toContain(endkundeId);
  });

  it('gibt Pruefsummen als Hex-Zeichenkette aus — passend zu manifest.csv, nicht als Puffer-Objekt', async () => {
    // **Der Fehler, den dieser Test festhaelt.** `NachweisExportAntwort` erbte
    // den Repository-Zeilentyp, und dort ist `manifestHash` ein `Buffer`. Was
    // beim Client ankam, war deshalb `{"type":"Buffer","data":[...]}` — die
    // Oberflaeche stuerzte beim Rendern ab („Objects are not valid as a React
    // child"), und zwar erst NACH dem erfolgreichen Anlegen: Der Export stand
    // in der Datenbank, der Nutzer sah eine Fehlerseite und legte ihn erneut an.
    //
    // Keine bestehende Pruefung sah es, weil alle nur `dateiname` und
    // `kategorie` lasen. Deshalb pruefen wir hier die Form UND den Zweck:
    // Die Pruefsumme dient dem Abgleich gegen die ausgelieferte `manifest.csv`,
    // also muss sie in derselben Schreibweise dastehen wie dort — hex.
    const jahr = neuesTestJahr();
    const { lauf } = await legeGruenenEinsparlaufAn(jahr, `HX-${jahr}`);

    const response = await request(testApp.httpServer)
      .post(`/nachweis/einsparlaeufe/${lauf.id}/exporte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    expect(response.status).toBe(201);
    const koerper = response.body as { id: string; manifestHash: unknown; dateien: { dateiname: string; dateiHash: unknown }[] };

    expect(koerper.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    for (const datei of koerper.dateien) {
      expect(datei.dateiHash, datei.dateiname).toMatch(/^[0-9a-f]{64}$/);
    }

    // Der eigentliche Zweck: Was auf dem Bildschirm steht, muss im gelieferten
    // Manifest wiederzufinden sein.
    const manifest = await request(testApp.httpServer)
      .get(`/nachweis/exporte/${koerper.id}/dateien/manifest.csv`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(manifest.status).toBe(200);
    for (const datei of koerper.dateien.filter((d) => d.dateiname !== 'manifest.csv')) {
      expect(manifest.text, datei.dateiname).toContain(String(datei.dateiHash));
    }

    // Auch der Abruf ueber GET liefert dieselbe Form — der Weg ueber die
    // Detailseite ist genau der, auf dem der Absturz auftrat.
    const erneut = await request(testApp.httpServer)
      .get(`/nachweis/exporte/${koerper.id}`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(erneut.status).toBe(200);
    expect((erneut.body as { manifestHash: unknown }).manifestHash).toBe(koerper.manifestHash);
  });

  it('Determinismus: zweimaliger Download derselben Datei liefert BIT-IDENTISCHEN Inhalt', async () => {
    const jahr = neuesTestJahr();
    const { lauf } = await legeGruenenEinsparlaufAn(jahr, `E2-${jahr}`);
    const exportResponse = await request(testApp.httpServer)
      .post(`/nachweis/einsparlaeufe/${lauf.id}/exporte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    const exportId = (exportResponse.body as { id: string }).id;

    const erst = await request(testApp.httpServer).get(`/nachweis/exporte/${exportId}/dateien/einspardaten_jahr.csv`).set('Authorization', `Bearer ${betriebToken}`);
    const zweit = await request(testApp.httpServer).get(`/nachweis/exporte/${exportId}/dateien/einspardaten_jahr.csv`).set('Authorization', `Bearer ${betriebToken}`);
    expect(erst.status).toBe(200);
    expect(zweit.status).toBe(200);
    expect(erst.text).toBe(zweit.text);
  });

  it('A.8.24 Hash-Mismatch: eine manipulierte Datei-Hash-Zeile fuehrt zur Verweigerung der Auslieferung', async () => {
    const jahr = neuesTestJahr();
    const { lauf } = await legeGruenenEinsparlaufAn(jahr, `E3-${jahr}`);
    const exportResponse = await request(testApp.httpServer)
      .post(`/nachweis/einsparlaeufe/${lauf.id}/exporte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    const exportId = (exportResponse.body as { id: string }).id;

    await dbClient.query(
      `UPDATE nachweis.export_datei SET datei_hash = decode(repeat('00', 32), 'hex') WHERE export_id = $1 AND dateiname = 'einspardaten_jahr.csv'`,
      [exportId],
    );

    const response = await request(testApp.httpServer).get(`/nachweis/exporte/${exportId}/dateien/einspardaten_jahr.csv`).set('Authorization', `Bearer ${betriebToken}`);
    expect(response.status).toBe(500);

    const auditRows = await dbClient.query(
      `SELECT ergebnis, kontext FROM audit.event WHERE event_typ = 'export.nachweis.abgerufen' AND kontext->>'export_id' = $1 ORDER BY seq DESC LIMIT 1`,
      [exportId],
    );
    expect(auditRows.rows[0]).toMatchObject({ ergebnis: 'error' });
  });

  it('Auditor-Asymmetrie (A19/B10): compliance-auditor x read:nachweis_export -> 403, compliance-auditor x read:einreichung -> 200', async () => {
    const jahr = neuesTestJahr();
    const { lauf } = await legeGruenenEinsparlaufAn(jahr, `E4-${jahr}`);
    const exportResponse = await request(testApp.httpServer)
      .post(`/nachweis/einsparlaeufe/${lauf.id}/exporte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    const exportId = (exportResponse.body as { id: string }).id;

    const auditorExportZugriff = await request(testApp.httpServer).get(`/nachweis/exporte/${exportId}`).set('Authorization', `Bearer ${auditorToken}`);
    expect(auditorExportZugriff.status).toBe(403);

    const einreichungResponse = await request(testApp.httpServer)
      .post(`/nachweis/exporte/${exportId}/einreichungen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ art: 'verwendungsnachweis', uebermittlungsweg: 'bscw_manuell', uebermitteltAt: new Date().toISOString() });
    expect(einreichungResponse.status).toBe(201);
    const einreichungId = (einreichungResponse.body as { id: string }).id;

    const auditorEinreichungZugriff = await request(testApp.httpServer).get(`/nachweis/einreichungen/${einreichungId}`).set('Authorization', `Bearer ${auditorToken}`);
    expect(auditorEinreichungZugriff.status).toBe(200);
  });

  // ADR-0007 A18/A11.12 — Art. 19 DSGVO: wer eingeschraenkt oder geloescht
  // wird, NACHDEM seine Daten beim Empfaenger liegen, loest eine
  // Mitteilungspflicht aus. Die Unverhaeltnismaessigkeits-Ausnahme greift
  // nicht: EIN Empfaenger, aktenkundig, Zuordnung per Abfrage.
  describe('Art.-19-Mitteilungspflichten', () => {
    async function einreichen(lauf: { readonly id: string }): Promise<string> {
      const exportResponse = await request(testApp.httpServer)
        .post(`/nachweis/einsparlaeufe/${lauf.id}/exporte`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({});
      const exportId = (exportResponse.body as { id: string }).id;

      const einreichung = await request(testApp.httpServer)
        .post(`/nachweis/exporte/${exportId}/einreichungen`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ art: 'verwendungsnachweis', uebermittlungsweg: 'bscw_manuell', uebermitteltAt: new Date().toISOString() });
      expect(einreichung.status).toBe(201);
      return (einreichung.body as { id: string }).id;
    }

    async function pflichten(token = betriebToken) {
      return request(testApp.httpServer).get('/nachweis/art19-pflichten').set('Authorization', `Bearer ${token}`);
    }

    it('meldet KEINE Pflicht, solange das Subjekt aktiv ist', async () => {
      const jahr = neuesTestJahr();
      const { lauf, endkundeId } = await legeGruenenEinsparlaufAn(jahr, `A19a-${jahr}`);
      await einreichen(lauf);

      const antwort = await pflichten();
      expect(antwort.status).toBe(200);
      const ids = (antwort.body as { items: { subjektId: string }[] }).items.map((i) => i.subjektId);
      expect(ids).not.toContain(endkundeId);
    });

    it('meldet eine offene Pflicht, sobald der eingereichte Endkunde eingeschraenkt wird', async () => {
      const jahr = neuesTestJahr();
      const { lauf, endkundeId } = await legeGruenenEinsparlaufAn(jahr, `A19b-${jahr}`);
      const einreichungId = await einreichen(lauf);

      // Ueber die ECHTE Route (seit ADR-0007 A11.1), nicht per SQL-Fixture.
      const gesperrt = await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/sperren`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        // `neuerhebungFortsetzen` (Auflage C-8) — bei lit. d Pflichtangabe.
        .send({ grund: 'art18_1d_widerspruch', neuerhebungFortsetzen: true });
      expect(gesperrt.status).toBe(200);

      const antwort = await pflichten();
      const zeile = (antwort.body as {
        items: { subjektId: string; einreichungId: string; anlass: string; offen: boolean }[];
      }).items.find((i) => i.subjektId === endkundeId);
      expect(zeile).toMatchObject({ einreichungId, anlass: 'einschraenkung_art18', offen: true });
    });

    it('schliesst die Pflicht mit der dokumentierten Mitteilung und protokolliert sie ohne Grund-Code', async () => {
      const jahr = neuesTestJahr();
      const { lauf, endkundeId } = await legeGruenenEinsparlaufAn(jahr, `A19c-${jahr}`);
      const einreichungId = await einreichen(lauf);
      await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/sperren`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ grund: 'art18_1a_richtigkeit' });

      const gemeldet = await request(testApp.httpServer)
        .post('/nachweis/art19-pflichten/mitteilungen')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ einreichungId, subjektTyp: 'endkunde', subjektId: endkundeId, anlass: 'einschraenkung_art18', kanal: 'elektronisch' });
      expect(gemeldet.status).toBe(200);

      const zeile = (gemeldet.body as { items: { subjektId: string; offen: boolean }[] }).items.find(
        (i) => i.subjektId === endkundeId,
      );
      expect(zeile?.offen).toBe(false);

      // Der differenzierte Art.-18-Grund verlaesst das System nicht — auch
      // nicht ins Protokoll DIESES Ereignisses (C4 Punkt 6).
      const auditRows = await dbClient.query(
        "SELECT kontext FROM audit.event WHERE event_typ = 'einreichung.nachweis.art19_mitgeteilt' AND objekt_ref = $1",
        [einreichungId],
      );
      expect(auditRows.rowCount).toBe(1);
      const kontext = (auditRows.rows[0] as { kontext: Record<string, unknown> }).kontext;
      expect(Object.keys(kontext).sort()).toEqual(['anlass', 'kanal', 'synthetic']);
      expect(kontext['anlass']).toBe('einschraenkung_art18');
    });

    it('lehnt eine zweite Meldung desselben Vorgangs mit 409 ab', async () => {
      const jahr = neuesTestJahr();
      const { lauf, endkundeId } = await legeGruenenEinsparlaufAn(jahr, `A19d-${jahr}`);
      const einreichungId = await einreichen(lauf);
      await request(testApp.httpServer)
        .post(`/stammdaten/endkunden/${endkundeId}/sperren`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ grund: 'art18_1a_richtigkeit' });

      const body = { einreichungId, subjektTyp: 'endkunde', subjektId: endkundeId, anlass: 'einschraenkung_art18', kanal: 'postalisch' };
      const ersteMeldung = await request(testApp.httpServer)
        .post('/nachweis/art19-pflichten/mitteilungen')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send(body);
      expect(ersteMeldung.status).toBe(200);

      const zweiteMeldung = await request(testApp.httpServer)
        .post('/nachweis/art19-pflichten/mitteilungen')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send(body);
      expect(zweiteMeldung.status).toBe(409);
    });

    it('lehnt eine Meldung ohne zugrundeliegende Pflicht mit 404 ab', async () => {
      const jahr = neuesTestJahr();
      const { lauf, endkundeId } = await legeGruenenEinsparlaufAn(jahr, `A19e-${jahr}`);
      const einreichungId = await einreichen(lauf);

      // Subjekt ist AKTIV — es gibt nichts mitzuteilen.
      const antwort = await request(testApp.httpServer)
        .post('/nachweis/art19-pflichten/mitteilungen')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ einreichungId, subjektTyp: 'endkunde', subjektId: endkundeId, anlass: 'einschraenkung_art18', kanal: 'postalisch' });
      expect(antwort.status).toBe(404);
    });

    it('ist fuer compliance-auditor lesbar, aber nicht meldbar (DS-01)', async () => {
      expect((await pflichten(auditorToken)).status).toBe(200);

      const versuch = await request(testApp.httpServer)
        .post('/nachweis/art19-pflichten/mitteilungen')
        .set('Authorization', `Bearer ${auditorToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          einreichungId: '0198c3aa-cccc-7000-8000-000000000001',
          subjektTyp: 'endkunde',
          subjektId: '0198c3aa-cccc-7000-8000-000000000002',
          anlass: 'einschraenkung_art18',
          kanal: 'postalisch',
        });
      expect(versuch.status).toBe(403);
    });
  });

  it('A23: zweck=wissenschaftliche_auswertung wird fail-closed abgewiesen', async () => {
    const jahr = neuesTestJahr();
    const { lauf } = await legeGruenenEinsparlaufAn(jahr, `E5-${jahr}`);
    const response = await request(testApp.httpServer)
      .post(`/nachweis/einsparlaeufe/${lauf.id}/exporte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ zweck: 'wissenschaftliche_auswertung' });
    expect(response.status).toBe(403);
  });

  it('A13: stationDarstellung=klarname OHNE anfrageRef wird abgewiesen', async () => {
    const jahr = neuesTestJahr();
    const { lauf } = await legeGruenenEinsparlaufAn(jahr, `E6-${jahr}`);
    const response = await request(testApp.httpServer)
      .post(`/nachweis/einsparlaeufe/${lauf.id}/exporte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ stationDarstellung: 'klarname' });
    expect(response.status).toBe(400);
  });

  it('A20: bei ausschliesslich synthetischer Klimaquelle (v1-Realitaet) unterbleibt die DWD-Attribution im Metablatt', async () => {
    const jahr = neuesTestJahr();
    const { lauf } = await legeGruenenEinsparlaufAn(jahr, `E7-${jahr}`);
    const exportResponse = await request(testApp.httpServer)
      .post(`/nachweis/einsparlaeufe/${lauf.id}/exporte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    const exportId = (exportResponse.body as { id: string }).id;

    const metablatt = await request(testApp.httpServer).get(`/nachweis/exporte/${exportId}/dateien/metablatt.csv`).set('Authorization', `Bearer ${betriebToken}`);
    expect(metablatt.status).toBe(200);
    expect(metablatt.text).toContain('nicht anwendbar');
    expect(metablatt.text).not.toContain('Deutscher Wetterdienst');
  });

  it('Korrektur (B7): eine Ersatz-Einreichung erzeugt einen Differenz-Report statt den Ursprung zu ueberschreiben', async () => {
    const jahr = neuesTestJahr();
    const szenario = await legeGruenenEinsparlaufAn(jahr, `E8-${jahr}`);

    const export1 = await request(testApp.httpServer)
      .post(`/nachweis/einsparlaeufe/${szenario.lauf.id}/exporte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    const export1Id = (export1.body as { id: string }).id;
    const einreichung1 = await request(testApp.httpServer)
      .post(`/nachweis/exporte/${export1Id}/einreichungen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ art: 'verwendungsnachweis', uebermittlungsweg: 'bscw_manuell', uebermitteltAt: new Date().toISOString() });
    expect(einreichung1.status).toBe(201);
    const einreichung1Id = (einreichung1.body as { id: string }).id;

    // Ersatz-Berechnungslauf (ADR-0006 F7(b)) -> Ersatz-Einsparlauf (ersetztEinsparlaufId).
    const mvetIdRow = await dbClient.query(
      `SELECT mvet.id FROM energy.messkonzept_version_energietraeger mvet
         JOIN analytics.berechnungslauf bl ON bl.mvet_id = mvet.id WHERE bl.id = $1`,
      [szenario.berechnungslaufId],
    );
    const mvetId = (mvetIdRow.rows[0] as { id: string }).id;
    const ersatzLaufResponse = await starteBerechnungslauf(
      testApp,
      betriebToken,
      berechnungslaufBody(szenario.endkundeId, mvetId, jahr, { ersetztLaufId: szenario.berechnungslaufId }),
    );
    expect(ersatzLaufResponse.status).toBe(201);

    const preflightService = testApp.app.get(PreflightService);
    const preflight2 = await mitTransaktion(testApp, () =>
      preflightService.ausfuehren({ foerderjahrId: szenario.foerderjahrId, profilCode: 'foerderjahr_preflight_de02' }, betriebSecurityContext(), false),
    );
    expect(preflight2.preflight.ergebnis).toBe('gruen');

    const einsparlaufService = testApp.app.get(EinsparlaufService);
    const lauf2 = await mitTransaktion(testApp, () =>
      einsparlaufService.starten(
        { foerderjahrId: szenario.foerderjahrId, preflightId: preflight2.preflight.id, art: 'foerderjahr_nachweis', ersetztEinsparlaufId: szenario.lauf.id, ausloeser: 'korrektur' },
        betriebSecurityContext(),
        false,
      ),
    );

    const export2 = await request(testApp.httpServer)
      .post(`/nachweis/einsparlaeufe/${lauf2.id}/exporte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    expect(export2.status).toBe(201);
    const export2Id = (export2.body as { id: string }).id;
    const dateinamen2 = (export2.body as { dateien: { dateiname: string }[] }).dateien.map((d) => d.dateiname);
    expect(dateinamen2).toContain('einspardaten_differenz.csv');

    const einreichung2 = await request(testApp.httpServer)
      .post(`/nachweis/exporte/${export2Id}/einreichungen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        art: 'verwendungsnachweis',
        uebermittlungsweg: 'bscw_manuell',
        uebermitteltAt: new Date().toISOString(),
        ersetztEinreichungId: einreichung1Id,
        korrekturGrundCode: 'messwert_korrektur',
      });
    expect(einreichung2.status).toBe(201);
    const einreichung2Id = (einreichung2.body as { id: string }).id;

    // Die ALTE Einreichung bleibt UNANGETASTET (append-only, kein Ueberschreiben).
    const alteEinreichung = await dbClient.query('SELECT manifest_hash FROM nachweis.einreichung WHERE id = $1', [einreichung1Id]);
    expect(alteEinreichung.rows).toHaveLength(1);

    const differenzen = await request(testApp.httpServer).get(`/nachweis/einreichungen/${einreichung2Id}/differenzen`).set('Authorization', `Bearer ${betriebToken}`);
    expect(differenzen.status).toBe(200);
    expect((differenzen.body as { daten: unknown[] }).daten.length).toBeGreaterThan(0);

    // Audit-Kontext: 'einreichung.nachweis.korrigiert' traegt differenz_richtung KLASSIERT, NIE endkunde_id/kWh.
    const auditRow = await dbClient.query(
      `SELECT kontext FROM audit.event WHERE event_typ = 'einreichung.nachweis.korrigiert' AND kontext->>'einreichung_id' = $1`,
      [einreichung2Id],
    );
    expect(auditRow.rows).toHaveLength(1);
    const kontext = (auditRow.rows[0] as { kontext: Record<string, unknown> }).kontext;
    expect(Object.keys(kontext)).not.toContain('endkunde_id');
    expect(['hoeher', 'niedriger', 'unveraendert']).toContain(kontext['differenz_richtung']);
    expect(JSON.stringify(kontext)).not.toContain(szenario.endkundeId);
  });

  it('Audit-Kontext (A19-Positivliste): export.nachweis.erzeugt traegt weder endkunde_id noch ein Export-Pseudonym noch einen kWh-Wert', async () => {
    const jahr = neuesTestJahr();
    const szenario = await legeGruenenEinsparlaufAn(jahr, `E9-${jahr}`);
    const exportResponse = await request(testApp.httpServer)
      .post(`/nachweis/einsparlaeufe/${szenario.lauf.id}/exporte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    const exportId = (exportResponse.body as { id: string }).id;

    const auditRow = await dbClient.query(`SELECT kontext FROM audit.event WHERE event_typ = 'export.nachweis.erzeugt' AND kontext->>'export_id' = $1`, [exportId]);
    expect(auditRow.rows).toHaveLength(1);
    const kontext = (auditRow.rows[0] as { kontext: Record<string, unknown> }).kontext;
    expect(Object.keys(kontext)).not.toContain('endkunde_id');
    expect(JSON.stringify(kontext)).not.toContain(szenario.endkundeId);
    expect(JSON.stringify(kontext)).not.toMatch(/EK-\d{4}/);
  });

  describe('Exportschema v2 (V0064) — Geraeteerkennungs-Quote im Nachweis (TB-05)', () => {
    /** Zaehler + Messkanal am System; liefert die id fuer die Zuordnung und den key fuer die Tageswerte. */
    async function legeKanalAn(systemId: string, energietraeger: string): Promise<{ id: string; key: number }> {
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
        .send({ messgroesse: 'Wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
      expect(kanal.status).toBe(201);
      const id = (kanal.body as { id: string }).id;
      const keyRow = await dbClient.query<{ kanal_key: number }>('SELECT kanal_key FROM energy.messkanal WHERE id = $1', [id]);
      return { id, key: keyRow.rows[0]?.kanal_key ?? 0 };
    }

    async function ladeDatei(exportId: string, dateiname: string): Promise<string> {
      const response = await request(testApp.httpServer)
        .get(`/nachweis/exporte/${exportId}/dateien/${dateiname}`)
        .set('Authorization', `Bearer ${betriebToken}`);
      expect(response.status).toBe(200);
      return response.text;
    }

    /**
     * Ein gruener Einsparlauf MIT gepflegter Geraeteerkennung: ein Kanal mit
     * Tageswerten, eine Gruppe, eine Zuordnung ueber `anteilProzent`.
     */
    async function legeSzeneMitZuordnungAn(jahr: number, suffix: string): Promise<{ readonly lauf: EinsparlaufAntwort; readonly endkundeId: string }> {
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, suffix);
      const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
      const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, `System-${suffix}`);
      await verknuepfeMvetMitSystem(dbClient, mvetId, systemId);

      const kanal = await legeKanalAn(systemId, 'gas');
      // 31 Januartage a 100 kWh = 3100 kWh Gesamtverbrauch.
      await dbClient.query(
        `INSERT INTO measurement.messwert_tag (messkanal_key, tag, zeitzone, verbrauch_kwh, qualitaet_min, anzahl_messwerte)
         SELECT $1, ($2::date + (n || ' days')::interval)::date, 'Europe/Berlin', 100, 1, 96
           FROM generate_series(0, 30) AS n`,
        [kanal.key, `${String(jahr)}-01-01`],
      );

      const gruppe = await request(testApp.httpServer)
        .post('/geraeteerkennung/gruppen')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({ endkundeId, bezeichnung: 'Wohnung Musterfrau' });
      expect(gruppe.status).toBe(201);

      const zuordnung = await request(testApp.httpServer)
        .post('/geraeteerkennung/zuordnungen')
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send({
          geraetegruppeId: (gruppe.body as { id: string }).id,
          messkanalId: kanal.id,
          methode: 'direktmessung',
          genauigkeitPct: 2.5,
          anteilProzent: 30,
          gueltigVon: `${String(jahr)}-01-01`,
        });
      expect(zuordnung.status).toBe(201);

      const laufResponse = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetId, jahr));
      expect(laufResponse.status).toBe(201);

      const foerderjahrId = await mitTransaktion(testApp, async () => {
        const repo = testApp.app.get(NachweisFoerderjahrRepository);
        const fj = await repo.insert({
          id: randomUUID(),
          code: `FJ-TB05-${suffix}`,
          vorhabenRef: 'AZ-TEST-EXPORT',
          nummer: 1,
          ...fensterAusMonaten(`${String(jahr)}-01-01`, `${String(jahr)}-01-01`),
          definitionQuelle: 'kalenderjahr',
          bescheidRef: null,
        });
        return fj.id;
      });

      const preflightService = testApp.app.get(PreflightService);
      const preflight = await mitTransaktion(testApp, () =>
        preflightService.ausfuehren({ foerderjahrId, profilCode: 'foerderjahr_preflight_de02' }, betriebSecurityContext(), false),
      );
      expect(preflight.preflight.ergebnis).toBe('gruen');

      const einsparlaufService = testApp.app.get(EinsparlaufService);
      const lauf = await mitTransaktion(testApp, () =>
        einsparlaufService.starten({ foerderjahrId, preflightId: preflight.preflight.id, art: 'foerderjahr_nachweis' }, betriebSecurityContext(), false),
      );
      return { lauf, endkundeId };
    }

    async function erzeugeExport(laufId: string, body: Record<string, unknown> = {}): Promise<string> {
      const response = await request(testApp.httpServer)
        .post(`/nachweis/einsparlaeufe/${laufId}/exporte`)
        .set('Authorization', `Bearer ${betriebToken}`)
        .set('Idempotency-Key', idempotencyKey())
        .send(body);
      expect(response.status).toBe(201);
      return (response.body as { id: string }).id;
    }

    it('weist die Quote gegen die Sollquote des Projektjahres aus — der Beleg fuer TB-05', async () => {
      // Bis V0064 enthielt das Buendel die Einsparung, aber nicht die
      // Zuordnung: Die Erfuellung von Kap. 5 war aus dem Nachweis nicht
      // ablesbar, obwohl die Quote gerechnet war und in der Oberflaeche stand.
      const jahr = neuesTestJahr();
      const { lauf } = await legeSzeneMitZuordnungAn(jahr, `TB05A-${jahr}`);
      const exportId = await erzeugeExport(lauf.id);

      const quote = await ladeDatei(exportId, 'geraeteerkennung_quote.csv');
      const zeilen = quote.split('\r\n').filter((z) => z.length > 0);

      expect(zeilen[0]).toBe('endkunde_pseudonym,energietraeger,foerderjahr_code,foerderjahr_nummer,von_monat,bis_monat,gesamt_kwh,zugeordnet_kwh,quote_pct,soll_quote_pct,erreicht,systeme_gesamt,systeme_entbehrlich,ohne_tageswerte');
      // 3100 kWh gesamt, 30 % zugeordnet = 930 kWh -> Quote 30 %, Soll 20 %.
      expect(zeilen[1]).toContain('3100.000,930.000,30.00,20.00,true');
    });

    it('traegt Methode und Genauigkeit je Gruppe — die Zuordnungs-Metadaten, die Kap. 5 verlangt', async () => {
      const jahr = neuesTestJahr();
      const { lauf } = await legeSzeneMitZuordnungAn(jahr, `TB05B-${jahr}`);
      const exportId = await erzeugeExport(lauf.id);

      const gruppen = await ladeDatei(exportId, 'geraeteerkennung_gruppe.csv');

      expect(gruppen).toContain('direktmessung');
      expect(gruppen).toContain('2.50');
      // Freitext-Bezeichnung bleibt draussen (A13-Muster) — der Regelexport
      // ist durchgehend pseudonymisiert.
      expect(gruppen).not.toContain('Musterfrau');
      expect(gruppen).toMatch(/GG-\d{4}/);
    });

    it('zeigt die Bezeichnung bei aktenkundiger Anfrage', async () => {
      const jahr = neuesTestJahr();
      const { lauf } = await legeSzeneMitZuordnungAn(jahr, `TB05C-${jahr}`);
      const exportId = await erzeugeExport(lauf.id, { stationDarstellung: 'klarname', anfrageRef: 'AZ-2027-042' });

      expect(await ladeDatei(exportId, 'geraeteerkennung_gruppe.csv')).toContain('Wohnung Musterfrau');
    });

    it('bleibt beim wiederholten Abruf bit-identisch — die Dateien gehen in dieselbe Hash-Pruefung', async () => {
      const jahr = neuesTestJahr();
      const { lauf } = await legeSzeneMitZuordnungAn(jahr, `TB05D-${jahr}`);
      const exportId = await erzeugeExport(lauf.id);

      const erst = await ladeDatei(exportId, 'geraeteerkennung_quote.csv');
      const zweit = await ladeDatei(exportId, 'geraeteerkennung_quote.csv');

      expect(zweit).toBe(erst);
    });

    it('legt neue Exporte unter der AKTIVEN Schema-Version an', async () => {
      const jahr = neuesTestJahr();
      const { lauf } = await legeSzeneMitZuordnungAn(jahr, `TB05E-${jahr}`);
      const exportId = await erzeugeExport(lauf.id);

      // Gegen den KATALOG geprueft, nicht gegen eine feste Zahl. Der
      // urspruengliche Test behauptete das im Kommentar und verglich
      // trotzdem mit 3 -- er brach bei V0077 (v4), obwohl seine Aussage
      // („neue Exporte nehmen die aktive Version") unveraendert galt.
      const aktiv = await dbClient.query<{ version: number }>(
        `SELECT version FROM analytics.verfahren_version
          WHERE code = 'nachweis_export_kanonisch' AND gueltig_bis IS NULL`,
      );
      const row = await dbClient.query<{ schema_version: number }>('SELECT schema_version FROM nachweis.export WHERE id = $1', [exportId]);

      expect(aktiv.rows[0]?.version).toBeDefined();
      expect(row.rows[0]?.schema_version).toBe(aktiv.rows[0]?.version);
    });
  });
});
