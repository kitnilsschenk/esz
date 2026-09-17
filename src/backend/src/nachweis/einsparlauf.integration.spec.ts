import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import {
  beendeNutzungsverhaeltnis,
  berechnungslaufBody,
  idempotencyKey,
  legeAnschlussnutzerAn,
  legeEndkundeAn,
  legeFoerderjahrAn,
  legeMvetAn,
  legeNutzungsverhaeltnisAn,
  legeSystemAn,
  neuesTestJahr,
  setzeAnschlussnutzerStatus,
  sperreEndkundeMitGrund,
  starteBerechnungslauf,
  verknuepfeMvetMitSystem,
} from './test-support/nachweis-test-fixtures';

/**
 * Integrationstests (ECHTER Postgres-Testcontainer) für den Einspar-Lauf
 * (ADR-0007 D1/B1/B2/B13) UNTER DEFAULT-BEDINGUNGEN (rot-Preflight, Gate ZU
 * — s. `preflight.integration.spec.ts`-Kopfkommentar). Deckt genau die
 * Szenarien ab, die OHNE gruenen Preflight testbar sind: `art=zwischenstand`
 * (D4 erlaubt das ausdruecklich), FJ-07c-Paar-Ausschluss-Sichtbarkeit (DE-02),
 * Append-only, Audit-Kontext. Der `art=foerderjahr_nachweis`-Erfolgspfad UND
 * die "OHNE gruenen Preflight abgewiesen"-Assertion liegen in
 * `preflight-gruen.integration.spec.ts` (dort ist der gruene Preflight
 * ueberhaupt erst erreichbar, s. dortiger Kopfkommentar).
 */
describe('Einsparlauf-Endpoint — Integrationstests (ADR-0007, zwischenstand-Pfad)', () => {
  let testApp: StammdatenTestApp;
  let betriebToken: string;
  let dbClient: Client;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
  }, 120_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  async function fuehrePreflightAus(foerderjahrId: string): Promise<string> {
    const response = await request(testApp.httpServer)
      .post('/nachweis/preflights')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ foerderjahrId, profilCode: 'foerderjahr_preflight_de02' });
    expect(response.status).toBe(201);
    return (response.body as { preflight: { id: string } }).preflight.id;
  }

  async function starteEinsparlauf(body: Record<string, unknown>): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
    const response = await request(testApp.httpServer)
      .post('/nachweis/einsparlaeufe')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send(body);
    return { status: response.status, body: response.body as Record<string, unknown> };
  }

  it('art=zwischenstand: erfolgreich trotz ROTEM Preflight (D4), FJ-07c-Paar bleibt SICHTBAR mit status=ausgeschlossen (DE-02)', async () => {
    const jahr = neuesTestJahr();

    const endkundeAktiv = await legeEndkundeAn(testApp, betriebToken, 'ZwischenAktiv');
    const mvetAktiv = await legeMvetAn(testApp, betriebToken, dbClient, endkundeAktiv);
    const laufAktiv = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeAktiv, mvetAktiv, jahr));
    expect(laufAktiv.status).toBe(201);

    const endkundeGesperrt = await legeEndkundeAn(testApp, betriebToken, 'ZwischenGesperrt');
    const mvetGesperrt = await legeMvetAn(testApp, betriebToken, dbClient, endkundeGesperrt);
    const laufGesperrt = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeGesperrt, mvetGesperrt, jahr));
    expect(laufGesperrt.status).toBe(201);
    await sperreEndkundeMitGrund(dbClient, endkundeGesperrt, 'art18_1b_unrechtmaessig');

    const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, jahr, { bisMonat: `${jahr}-01-01` });
    const preflightId = await fuehrePreflightAus(foerderjahrId);

    const { status, body } = await starteEinsparlauf({ foerderjahrId, preflightId, art: 'zwischenstand' });
    expect(status).toBe(201);
    expect(body['art']).toBe('zwischenstand');
    expect(body['umfangPaareAnzahl']).toBe(2);

    const ergebnisse = body['ergebnisse'] as { endkundeId: string; status: string; ausschlussGrundCode: string | null; einsparungKwhEndenergie: number | null }[];
    expect(ergebnisse).toHaveLength(2);

    const zeileGesperrt = ergebnisse.find((z) => z.endkundeId === endkundeGesperrt);
    expect(zeileGesperrt).toMatchObject({ status: 'ausgeschlossen', ausschlussGrundCode: 'datenschutzrechtliche_einschraenkung', einsparungKwhEndenergie: null });

    const zeileAktiv = ergebnisse.find((z) => z.endkundeId === endkundeAktiv);
    // Ohne Messwerte ist der Monat nicht_ausweisbar -> Floor unterschritten -> nicht_nachweisbar (KEIN Ausschluss, ANDERE Achse als FJ-07c).
    expect(zeileAktiv).toMatchObject({ status: 'nicht_nachweisbar', ausschlussGrundCode: null, einsparungKwhEndenergie: null });

    const einsparlaufId = body['id'] as string;
    const ergebnisseResponse = await request(testApp.httpServer)
      .get(`/nachweis/einsparlaeufe/${einsparlaufId}/ergebnisse`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(ergebnisseResponse.status).toBe(200);
    expect((ergebnisseResponse.body as { daten: unknown[] }).daten).toHaveLength(2);

    const bindungenResponse = await request(testApp.httpServer)
      .get(`/nachweis/einsparlaeufe/${einsparlaufId}/bindungen`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(bindungenResponse.status).toBe(200);
    // BEIDE Paare werden gebunden (auch das Art.-18-ausgeschlossene) — der
    // Ausschluss wirkt erst auf `einsparlauf_ergebnis`, NICHT auf die
    // Monats-Bindung selbst (B2 bleibt unangetastet von FJ-07c).
    expect((bindungenResponse.body as { daten: unknown[] }).daten).toHaveLength(2);
  });

  describe('ADR-0007 O-B3b — Substitutions-Merkmal (FJ-06) verdrahtet', () => {
    it('energietraegerSubstitution=true -> Paar ausgeschlossen MIT Ausweis (DE-02), NICHT abweichende Berechnung', async () => {
      const jahr = neuesTestJahr();
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, 'Substitution');
      const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId, { baselineWert: 20000, energietraegerSubstitution: true });
      const laufResponse = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetId, jahr));
      expect(laufResponse.status).toBe(201);
      const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, jahr, { bisMonat: `${jahr}-01-01` });
      const preflightId = await fuehrePreflightAus(foerderjahrId);

      const { status, body } = await starteEinsparlauf({ foerderjahrId, preflightId, art: 'zwischenstand' });
      expect(status).toBe(201);
      const ergebnisse = body['ergebnisse'] as { endkundeId: string; status: string; ausschlussGrundCode: string | null; einsparungKwhEndenergie: number | null }[];
      const zeile = ergebnisse.find((z) => z.endkundeId === endkundeId);
      // Sichtbar (DE-02) trotz Ausschluss — die Zeile fehlt NICHT aus `ergebnisse`.
      expect(zeile).toMatchObject({ status: 'ausgeschlossen', ausschlussGrundCode: 'energietraeger_substitution_v1_nicht_unterstuetzt', einsparungKwhEndenergie: null });
    });
  });

  describe('ADR-0006 P4 / ADR-0007 A12 — Anschlussnutzer-Sperre (Zeitraum-Semantik, User-Entscheidung 2026-08-26)', () => {
    /** `bisMonat` = GENAU der eine Monat, den der Lauf abdeckt (Januar, s. `berechnungslaufBody`). */
    async function legeScopePaarMitSystemAn(namenSuffix: string): Promise<{
      readonly jahr: number;
      readonly endkundeId: string;
      readonly systemId: string;
      readonly foerderjahrId: string;
      readonly preflightId: string;
    }> {
      const jahr = neuesTestJahr();
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, namenSuffix);
      const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
      const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, `System-${namenSuffix}`);
      await verknuepfeMvetMitSystem(dbClient, mvetId, systemId);
      const laufResponse = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetId, jahr));
      expect(laufResponse.status).toBe(201);
      const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, jahr, { bisMonat: `${jahr}-01-01` });
      const preflightId = await fuehrePreflightAus(foerderjahrId);
      return { jahr, endkundeId, systemId, foerderjahrId, preflightId };
    }

    function findeZeile(body: Record<string, unknown>, endkundeId: string): { status: string; ausschlussGrundCode: string | null } | undefined {
      const ergebnisse = body['ergebnisse'] as { endkundeId: string; status: string; ausschlussGrundCode: string | null }[];
      return ergebnisse.find((z) => z.endkundeId === endkundeId);
    }

    it('gesperrter Anschlussnutzer mit UEBERLAPPENDEM (offenen) Nutzungsverhaeltnis -> Paar ausgeschlossen (datenschutzrechtliche_einschraenkung)', async () => {
      const { jahr, endkundeId, systemId, foerderjahrId, preflightId } = await legeScopePaarMitSystemAn('AnschlussSperreOverlap');
      const anschlussnutzerId = await legeAnschlussnutzerAn(testApp, betriebToken, endkundeId, 'AnschlussSperreOverlap');
      await legeNutzungsverhaeltnisAn(testApp, betriebToken, { endkundeId, anschlussnutzerId, systemId, gueltigVon: `${jahr}-01-01T00:00:00.000Z` });
      await setzeAnschlussnutzerStatus(dbClient, anschlussnutzerId, 'gesperrt');

      const { status, body } = await starteEinsparlauf({ foerderjahrId, preflightId, art: 'zwischenstand' });
      expect(status).toBe(201);
      expect(findeZeile(body, endkundeId)).toMatchObject({ status: 'ausgeschlossen', ausschlussGrundCode: 'datenschutzrechtliche_einschraenkung' });
    });

    it('gesperrter Anschlussnutzer, Nutzungsverhaeltnis AUSSERHALB des Lauf-Zeitraums (beginnt NACH dem Lauf) -> KEIN Ausschluss', async () => {
      const { jahr, endkundeId, systemId, foerderjahrId, preflightId } = await legeScopePaarMitSystemAn('AnschlussSperreAusserhalb');
      const anschlussnutzerId = await legeAnschlussnutzerAn(testApp, betriebToken, endkundeId, 'AnschlussSperreAusserhalb');
      // Lauf deckt Januar ab (berechnungslaufBody) — dieses Nutzungsverhaeltnis beginnt erst im MAERZ, ueberlappt also NICHT.
      await legeNutzungsverhaeltnisAn(testApp, betriebToken, { endkundeId, anschlussnutzerId, systemId, gueltigVon: `${jahr}-03-01T00:00:00.000Z` });
      await setzeAnschlussnutzerStatus(dbClient, anschlussnutzerId, 'gesperrt');

      const { status, body } = await starteEinsparlauf({ foerderjahrId, preflightId, art: 'zwischenstand' });
      expect(status).toBe(201);
      // Identisch zum unbetroffenen Fall (kein Ausschluss, Floor-Unterschreitung mangels Messwerten): `nicht_nachweisbar`.
      expect(findeZeile(body, endkundeId)).toMatchObject({ status: 'nicht_nachweisbar', ausschlussGrundCode: null });
    });

    it('gesperrter Anschlussnutzer, Nutzungsverhaeltnis BEENDET aber ueberlappend (Kern der User-Entscheidung 2026-08-26) -> Ausschluss', async () => {
      const { jahr, endkundeId, systemId, foerderjahrId, preflightId } = await legeScopePaarMitSystemAn('AnschlussSperreBeendetUeberlapp');
      const anschlussnutzerId = await legeAnschlussnutzerAn(testApp, betriebToken, endkundeId, 'AnschlussSperreBeendetUeberlapp');
      const nutzungsverhaeltnisId = await legeNutzungsverhaeltnisAn(testApp, betriebToken, {
        endkundeId,
        anschlussnutzerId,
        systemId,
        gueltigVon: `${jahr}-01-01T00:00:00.000Z`,
      });
      // Der Mieter ist am 15. Januar ausgezogen — SEIN Nutzungsverhaeltnis ist beendet, ueberlappt aber weiterhin
      // den Lauf-Zeitraum (Januar): seine Daten aus dieser Zeit stecken bereits im Lauf (User-Entscheidung).
      await beendeNutzungsverhaeltnis(testApp, betriebToken, nutzungsverhaeltnisId, `${jahr}-01-15T00:00:00.000Z`);
      await setzeAnschlussnutzerStatus(dbClient, anschlussnutzerId, 'gesperrt');

      const { status, body } = await starteEinsparlauf({ foerderjahrId, preflightId, art: 'zwischenstand' });
      expect(status).toBe(201);
      expect(findeZeile(body, endkundeId)).toMatchObject({ status: 'ausgeschlossen', ausschlussGrundCode: 'datenschutzrechtliche_einschraenkung' });
    });
  });

  describe('Audit-Kontext (A19 — Positivliste, KEIN endkunde_id/Pseudonym)', () => {
    it('einsparlauf.nachweis.angefordert/abgeschlossen tragen KEINEN endkunde_id-Schluessel', async () => {
      const jahr = neuesTestJahr();
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, 'AuditEinsparlauf');
      const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
      await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetId, jahr));
      const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, jahr, { bisMonat: `${jahr}-01-01` });
      const preflightId = await fuehrePreflightAus(foerderjahrId);

      const { status, body } = await starteEinsparlauf({ foerderjahrId, preflightId, art: 'zwischenstand' });
      expect(status).toBe(201);
      const einsparlaufId = body['id'] as string;

      const auditRows = await dbClient.query(
        `SELECT event_typ, kontext FROM audit.event
          WHERE event_typ LIKE 'einsparlauf.nachweis.%' AND kontext->>'preflight_id' = $1
          ORDER BY seq ASC`,
        [preflightId],
      );
      expect(auditRows.rows.map((r: { event_typ: string }) => r.event_typ)).toEqual([
        'einsparlauf.nachweis.angefordert',
        'einsparlauf.nachweis.abgeschlossen',
      ]);
      const abgeschlossen = auditRows.rows[1] as { kontext: Record<string, unknown> };
      expect(abgeschlossen.kontext['einsparlauf_id']).toBe(einsparlaufId);
      for (const row of auditRows.rows as { kontext: Record<string, unknown> }[]) {
        expect(Object.keys(row.kontext)).not.toContain('endkunde_id');
        expect(Object.keys(row.kontext)).not.toContain('pseudonym');
        expect(JSON.stringify(row.kontext)).not.toContain(endkundeId);
        expect(row.kontext['synthetic']).toBe(true);
      }
    });
  });

  describe('Append-only-Nachweis (edms_app-DB-Rolle, 42501)', () => {
    it('UPDATE/DELETE auf nachweis.einsparlauf/_bindung/_ergebnis schlaegt fuer edms_app fehl', async () => {
      const jahr = neuesTestJahr();
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, 'AppendOnlyEinsparlauf');
      const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
      await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetId, jahr));
      const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, jahr, { bisMonat: `${jahr}-01-01` });
      const preflightId = await fuehrePreflightAus(foerderjahrId);
      const { status, body } = await starteEinsparlauf({ foerderjahrId, preflightId, art: 'zwischenstand' });
      expect(status).toBe(201);
      const einsparlaufId = body['id'] as string;

      const appClient = new Client({ connectionString: testApp.container.getConnectionUri() });
      await appClient.connect();
      try {
        await appClient.query('SET ROLE edms_app');
        await expect(
          appClient.query(`UPDATE nachweis.einsparlauf SET ausloeser = 'job' WHERE id = $1`, [einsparlaufId]),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(appClient.query(`DELETE FROM nachweis.einsparlauf WHERE id = $1`, [einsparlaufId])).rejects.toMatchObject({
          code: '42501',
        });
        await expect(
          appClient.query(`UPDATE nachweis.einsparlauf_bindung SET behandlung = 'ausgeschlossen' WHERE einsparlauf_id = $1`, [einsparlaufId]),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          appClient.query(`UPDATE nachweis.einsparlauf_ergebnis SET status = 'ausgewiesen' WHERE einsparlauf_id = $1`, [einsparlaufId]),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        await appClient.query('RESET ROLE').catch(() => undefined);
        await appClient.end();
      }
    });
  });
});
