import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import {
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
  sperreEndkundeOhneGrund,
  starteBerechnungslauf,
  verknuepfeMvetMitSystem,
} from './test-support/nachweis-test-fixtures';

/**
 * Integrationstests (ECHTER Postgres-Testcontainer, Muster
 * `berechnung/berechnungslauf.integration.spec.ts`) für den
 * Vollständigkeits-Preflight (ADR-0007 D4/B4, Auflage A11 FJ-07a/b/c).
 *
 * ROT ist unter DEFAULT-Bedingungen der STRUKTURELL ERWARTETE Fall in diesem
 * Codestand — seit der A-1-Freigabe (2026-09-09) allerdings nur noch wegen
 * EINER Vorbedingung: `FJ-09` (`EDMS_SYNTHETIC_ONLY=true`, Gate ZU) feuert
 * IMMER als Blocker. `FJ-08` (DWD-Quellenvermerk-Platzhalter) ist erledigt
 * und feuert nicht mehr; die Erwartungen unten stehen deshalb auf EINEM
 * systembedingten Blocker statt auf zweien. Ein GRÜNER Preflight ist erst
 * nach Öffnung des Ingest-Gates erreichbar (s.
 * `preflight-gruen.integration.spec.ts`, das `synthetic:false` explizit
 * uebergibt).
 *
 * JEDER Test verwendet EIN EIGENES Kalenderjahr (`neuesTestJahr()`) für
 * Förderjahr UND Berechnungslauf-Periode — `nachweis`s Umfangsregel
 * (`findScopePaare()`) liest ALLE ueberlappenden `analytics.berechnungslauf`-
 * Zeilen der GESAMTEN (Testcontainer-)DB, unabhaengig davon, welcher Test sie
 * angelegt hat. Ohne diese Isolation waeren `blockerAnzahl`/`umfangPaareAnzahl`
 * reihenfolgenabhaengig (`.claude/rules/tests.md`).
 */
describe('Preflight-Endpoint — Integrationstests (ADR-0007, ROT-Pfad + A11)', () => {
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

  async function fuehrePreflightAus(foerderjahrId: string): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
    const response = await request(testApp.httpServer)
      .post('/nachweis/preflights')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ foerderjahrId, profilCode: 'foerderjahr_preflight_de02' });
    return { status: response.status, body: response.body as Record<string, unknown> };
  }

  describe('ROT unter Default-Bedingungen (FJ-09)', () => {
    it('leeres Foerderjahr (kein Scope) ist dennoch ROT (genau FJ-09), NICHT gruen', async () => {
      const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, neuesTestJahr());
      const { status, body } = await fuehrePreflightAus(foerderjahrId);
      expect(status).toBe(201);
      const preflight = (body as { preflight: Record<string, unknown> }).preflight;
      expect(preflight['ergebnis']).toBe('rot');
      expect(preflight['blockerAnzahl']).toBe(1); // GENAU FJ-09, kein Scope-Rauschen
      expect(preflight['umfangPaareAnzahl']).toBe(0);

      const befunde = (body as { befunde: { regelCode: string; schwere: string }[] }).befunde;
      const regelCodes = befunde.map((b) => b.regelCode);
      expect(regelCodes).toContain('FJ-09');
      // FJ-08 ist seit der A-1-Freigabe erledigt und darf NICHT mehr auftauchen.
      expect(regelCodes).not.toContain('FJ-08');
    });

    it('wiederholbar: ein zweiter Preflight-Lauf desselben Foerderjahres erzeugt einen NEUEN, eigenstaendigen Datensatz (append-only)', async () => {
      const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, neuesTestJahr());
      const erster = await fuehrePreflightAus(foerderjahrId);
      const zweiter = await fuehrePreflightAus(foerderjahrId);
      expect(erster.status).toBe(201);
      expect(zweiter.status).toBe(201);
      const idErster = (erster.body as { preflight: { id: string } }).preflight.id;
      const idZweiter = (zweiter.body as { preflight: { id: string } }).preflight.id;
      expect(idErster).not.toBe(idZweiter);
    });
  });

  describe('A11 — FJ-07a/b/c-Differenzierung (Art.-18-Sperre ist PAAR-Ausschluss, kein Foerderjahr-Blocker)', () => {
    async function legeScopePaarAn(namenSuffix: string): Promise<{ readonly endkundeId: string; readonly foerderjahrId: string }> {
      const jahr = neuesTestJahr();
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, namenSuffix);
      const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
      const laufResponse = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetId, jahr));
      expect(laufResponse.status).toBe(201);
      // Foerderjahr = GENAU der eine Monat, den der Lauf abdeckt (Januar) —
      // sonst wuerden FJ-02 ("kein Kandidat") fuer Feb/Maerz/Apr die
      // blockerAnzahl-Assertions verrauschen (dieser Testblock prueft FJ-07,
      // nicht FJ-02).
      const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, jahr, { bisMonat: `${jahr}-01-01` });
      return { endkundeId, foerderjahrId };
    }

    it('FJ-07a: verarbeitungs_status=geloescht -> HINWEIS, kein Blocker-Beitrag, Endkunde regulaer im Scope', async () => {
      const { endkundeId, foerderjahrId } = await legeScopePaarAn('FJ07a');
      await dbClient.query(`UPDATE energy.endkunde SET verarbeitungs_status = 'geloescht' WHERE id = $1`, [endkundeId]);

      const { body } = await fuehrePreflightAus(foerderjahrId);
      const preflight = (body as { preflight: Record<string, unknown> }).preflight;
      const befunde = (body as { befunde: { regelCode: string; schwere: string; endkundeId: string | null }[] }).befunde;
      const eigene = befunde.filter((b) => b.endkundeId === endkundeId && b.regelCode === 'FJ-07a');
      expect(eigene).toHaveLength(1);
      expect(eigene[0]?.schwere).toBe('hinweis');
      expect(preflight['blockerAnzahl']).toBe(1); // nur FJ-09, FJ-07a traegt NICHTS bei
      expect(preflight['umfangPaareAnzahl']).toBe(1); // Endkunde bleibt REGULAER im Scope
    });

    it.each(['art18_1a_richtigkeit', 'art18_1c_rechtsverteidigung_betroffener'] as const)(
      'FJ-07b (Grund %s): WARNUNG, zaehlt NICHT als Foerderjahr-Blocker',
      async (grund) => {
        const { endkundeId, foerderjahrId } = await legeScopePaarAn(`FJ07b-${grund}`);
        await sperreEndkundeMitGrund(dbClient, endkundeId, grund);

        const { body } = await fuehrePreflightAus(foerderjahrId);
        const preflight = (body as { preflight: Record<string, unknown> }).preflight;
        const befunde = (body as { befunde: { regelCode: string; schwere: string; endkundeId: string | null }[] }).befunde;
        const eigene = befunde.filter((b) => b.endkundeId === endkundeId && b.regelCode === 'FJ-07b');
        expect(eigene).toHaveLength(1);
        expect(eigene[0]?.schwere).toBe('warnung');
        expect(preflight['blockerAnzahl']).toBe(1);
      },
    );

    it.each(['art18_1b_unrechtmaessig', 'art18_1d_widerspruch'] as const)(
      'FJ-07c (Grund %s): BLOCKER auf Befund-Ebene, ABER zaehlt NICHT in preflight.blockerAnzahl (C2-Kernkorrektur)',
      async (grund) => {
        const { endkundeId, foerderjahrId } = await legeScopePaarAn(`FJ07c-${grund}`);
        await sperreEndkundeMitGrund(dbClient, endkundeId, grund);

        const { body } = await fuehrePreflightAus(foerderjahrId);
        const preflight = (body as { preflight: Record<string, unknown> }).preflight;
        const befunde = (body as { befunde: { regelCode: string; schwere: string; endkundeId: string | null }[] }).befunde;
        const eigene = befunde.filter((b) => b.endkundeId === endkundeId && b.regelCode === 'FJ-07c');
        expect(eigene).toHaveLength(1);
        expect(eigene[0]?.schwere).toBe('blocker');

        // KRITISCHE Assertion (A11/C2): trotz des paar-scoped Blocker-Befunds
        // bleibt preflight.blockerAnzahl bei GENAU 1 (FJ-09) — waere die
        // A11-Reform NICHT umgesetzt, stuende hier 3.
        expect(preflight['blockerAnzahl']).toBe(1);
      },
    );

    it('gesperrt OHNE Grund (Bestandsdaten) -> fail-closed wie FJ-07c behandelt (Blocker-Befund, aber KEIN Foerderjahr-Blocker-Beitrag)', async () => {
      const { endkundeId, foerderjahrId } = await legeScopePaarAn('FJ07c-ohne-grund');
      await sperreEndkundeOhneGrund(dbClient, endkundeId);

      const { body } = await fuehrePreflightAus(foerderjahrId);
      const preflight = (body as { preflight: Record<string, unknown> }).preflight;
      const befunde = (body as { befunde: { regelCode: string; schwere: string; endkundeId: string | null; kennzahlKlasse: string | null }[] }).befunde;
      const eigene = befunde.filter((b) => b.endkundeId === endkundeId && b.regelCode === 'FJ-07c');
      expect(eigene).toHaveLength(1);
      expect(eigene[0]?.schwere).toBe('blocker');
      expect(eigene[0]?.kennzahlKlasse).toBe('grund_fehlt');
      expect(preflight['blockerAnzahl']).toBe(1);
    });
  });

  describe('ADR-0007 P4/A12 — FJ-11a/b/c (Anschlussnutzer-Sperre) und FJ-10 (Kette nicht aufloesbar)', () => {
    async function legeScopePaarMitSystemAn(namenSuffix: string): Promise<{
      readonly jahr: number;
      readonly endkundeId: string;
      readonly systemId: string;
      readonly foerderjahrId: string;
    }> {
      const jahr = neuesTestJahr();
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, namenSuffix);
      const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
      const systemId = await legeSystemAn(testApp, betriebToken, endkundeId, `System-${namenSuffix}`);
      await verknuepfeMvetMitSystem(dbClient, mvetId, systemId);
      const laufResponse = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetId, jahr));
      expect(laufResponse.status).toBe(201);
      const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, jahr, { bisMonat: `${jahr}-01-01` });
      return { jahr, endkundeId, systemId, foerderjahrId };
    }

    it('FJ-10: mvet OHNE System-Zuordnung (V0028-Uebergangszustand) -> blocker-Befund, aber KEIN Foerderjahr-Blocker-Beitrag', async () => {
      const jahr = neuesTestJahr();
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, 'FJ10');
      const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
      const laufResponse = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetId, jahr));
      expect(laufResponse.status).toBe(201);
      const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, jahr, { bisMonat: `${jahr}-01-01` });

      const { body } = await fuehrePreflightAus(foerderjahrId);
      const preflight = (body as { preflight: Record<string, unknown> }).preflight;
      const befunde = (body as { befunde: { regelCode: string; schwere: string; endkundeId: string | null }[] }).befunde;
      const eigene = befunde.filter((b) => b.endkundeId === endkundeId && b.regelCode === 'FJ-10');
      expect(eigene).toHaveLength(1);
      expect(eigene[0]?.schwere).toBe('blocker');
      expect(preflight['blockerAnzahl']).toBe(1); // nur FJ-09, FJ-10 traegt NICHT bei
    });

    it('FJ-11c: gesperrter Anschlussnutzer mit ueberlappendem (offenen) Nutzungsverhaeltnis -> blocker-Befund (fail-closed, kein Grund-Feld), aber KEIN Foerderjahr-Blocker-Beitrag', async () => {
      const { jahr, endkundeId, systemId, foerderjahrId } = await legeScopePaarMitSystemAn('FJ11c');
      const anschlussnutzerId = await legeAnschlussnutzerAn(testApp, betriebToken, endkundeId, 'FJ11c');
      await legeNutzungsverhaeltnisAn(testApp, betriebToken, { endkundeId, anschlussnutzerId, systemId, gueltigVon: `${jahr}-01-01T00:00:00.000Z` });
      await setzeAnschlussnutzerStatus(dbClient, anschlussnutzerId, 'gesperrt');

      const { body } = await fuehrePreflightAus(foerderjahrId);
      const preflight = (body as { preflight: Record<string, unknown> }).preflight;
      const befunde = (body as { befunde: { regelCode: string; schwere: string; endkundeId: string | null; kennzahlKlasse: string | null }[] }).befunde;
      const eigene = befunde.filter((b) => b.endkundeId === endkundeId && b.regelCode === 'FJ-11c');
      expect(eigene).toHaveLength(1);
      expect(eigene[0]?.schwere).toBe('blocker');
      expect(eigene[0]?.kennzahlKlasse).toContain(anschlussnutzerId);
      expect(eigene[0]?.kennzahlKlasse).toContain('grund_fehlt');
      expect(preflight['blockerAnzahl']).toBe(1); // nur FJ-09, FJ-11c traegt NICHT bei
    });

    it('FJ-11a: geloeschter Anschlussnutzer -> hinweis, kein Blocker-Beitrag', async () => {
      const { jahr, endkundeId, systemId, foerderjahrId } = await legeScopePaarMitSystemAn('FJ11a');
      const anschlussnutzerId = await legeAnschlussnutzerAn(testApp, betriebToken, endkundeId, 'FJ11a');
      await legeNutzungsverhaeltnisAn(testApp, betriebToken, { endkundeId, anschlussnutzerId, systemId, gueltigVon: `${jahr}-01-01T00:00:00.000Z` });
      await setzeAnschlussnutzerStatus(dbClient, anschlussnutzerId, 'geloescht');

      const { body } = await fuehrePreflightAus(foerderjahrId);
      const preflight = (body as { preflight: Record<string, unknown> }).preflight;
      const befunde = (body as { befunde: { regelCode: string; schwere: string; endkundeId: string | null }[] }).befunde;
      const eigene = befunde.filter((b) => b.endkundeId === endkundeId && b.regelCode === 'FJ-11a');
      expect(eigene).toHaveLength(1);
      expect(eigene[0]?.schwere).toBe('hinweis');
      expect(preflight['blockerAnzahl']).toBe(1);
    });
  });

  describe('D2 — Bindungs-Mehrdeutigkeit', () => {
    it('gleiche Werte (identische Kandidaten) -> FJ-05 WARNUNG', async () => {
      const jahr = neuesTestJahr();
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, 'MehrdeutigGleich');
      const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
      const stationRef = `TEST-${randomUUID()}`;
      const body = berechnungslaufBody(endkundeId, mvetId, jahr, { stationRef });
      const erster = await starteBerechnungslauf(testApp, betriebToken, body);
      const zweiter = await starteBerechnungslauf(testApp, betriebToken, body);
      expect(erster.status).toBe(201);
      expect(zweiter.status).toBe(201);
      // Deterministische synthetische Klimadaten + identischer Body -> identische referenzKwh/istKwh (0, keine Messwerte).
      expect(erster.body['id']).not.toBe(zweiter.body['id']);

      const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, jahr, { bisMonat: `${jahr}-01-01` });
      const { body: preflightBody } = await fuehrePreflightAus(foerderjahrId);
      const befunde = (preflightBody as { befunde: { regelCode: string; schwere: string; endkundeId: string | null; kennzahlKlasse: string | null }[] }).befunde;
      const fj05 = befunde.filter((b) => b.endkundeId === endkundeId && b.regelCode === 'FJ-05');
      expect(fj05.length).toBeGreaterThan(0);
      expect(fj05.every((b) => b.schwere === 'warnung')).toBe(true);
      expect(fj05[0]?.kennzahlKlasse).toBe('kandidaten_2');
    });

    it('abweichende Werte (unterschiedliche mvet/baseline) -> FJ-05 BLOCKER', async () => {
      const jahr = neuesTestJahr();
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, 'MehrdeutigAbweichend');
      const mvetA = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId, { baselineWert: 20000 });
      const mvetB = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId, { baselineWert: 30000 });
      const stationRef = `TEST-${randomUUID()}`;
      const erster = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetA, jahr, { stationRef }));
      const zweiter = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetB, jahr, { stationRef }));
      expect(erster.status).toBe(201);
      expect(zweiter.status).toBe(201);

      const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, jahr, { bisMonat: `${jahr}-01-01` });
      const { body: preflightBody } = await fuehrePreflightAus(foerderjahrId);
      const preflight = (preflightBody as { preflight: Record<string, unknown> }).preflight;
      const befunde = (preflightBody as { befunde: { regelCode: string; schwere: string; endkundeId: string | null }[] }).befunde;
      const fj05 = befunde.filter((b) => b.endkundeId === endkundeId && b.regelCode === 'FJ-05');
      expect(fj05.length).toBeGreaterThan(0);
      expect(fj05.every((b) => b.schwere === 'blocker')).toBe(true);
      // FJ-05 ist ein ECHTER Foerderjahr-Blocker (anders als FJ-07c) -> zaehlt mit.
      expect(preflight['blockerAnzahl']).toBe(1 + fj05.length); // FJ-09 + je 1x FJ-05 pro betroffenem Monat
    });
  });

  describe('Audit-Kontext (A19 — Positivliste, KEIN endkunde_id/Pseudonym)', () => {
    it('preflight.nachweis.durchgefuehrt traegt KEINEN endkunde_id-Schluessel', async () => {
      const jahr = neuesTestJahr();
      const endkundeId = await legeEndkundeAn(testApp, betriebToken, 'AuditKontext');
      const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
      await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetId, jahr));
      const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, jahr, { bisMonat: `${jahr}-01-01` });

      const { body } = await fuehrePreflightAus(foerderjahrId);
      const preflightId = (body as { preflight: { id: string } }).preflight.id;

      const auditRows = await dbClient.query(
        `SELECT kontext FROM audit.event WHERE event_typ = 'preflight.nachweis.durchgefuehrt' AND kontext->>'preflight_id' = $1`,
        [preflightId],
      );
      expect(auditRows.rowCount).toBe(1);
      const kontext = (auditRows.rows[0] as { kontext: Record<string, unknown> }).kontext;
      expect(Object.keys(kontext)).not.toContain('endkunde_id');
      expect(Object.keys(kontext)).not.toContain('pseudonym');
      expect(JSON.stringify(kontext)).not.toContain(endkundeId);
      expect(kontext['synthetic']).toBe(true);
      expect(typeof kontext['regel_codes']).toBe('string');
    });
  });

  describe('Append-only-Nachweis (edms_app-DB-Rolle, 42501)', () => {
    it('UPDATE/DELETE auf nachweis.preflight/preflight_befund schlaegt fuer edms_app fehl', async () => {
      const foerderjahrId = await legeFoerderjahrAn(testApp, betriebToken, neuesTestJahr());
      const { body } = await fuehrePreflightAus(foerderjahrId);
      const preflightId = (body as { preflight: { id: string } }).preflight.id;

      const appClient = new Client({ connectionString: testApp.container.getConnectionUri() });
      await appClient.connect();
      try {
        await appClient.query('SET ROLE edms_app');
        await expect(
          appClient.query(`UPDATE nachweis.preflight SET ergebnis = 'gruen' WHERE id = $1`, [preflightId]),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(appClient.query(`DELETE FROM nachweis.preflight WHERE id = $1`, [preflightId])).rejects.toMatchObject({
          code: '42501',
        });
        await expect(
          appClient.query(`UPDATE nachweis.preflight_befund SET schwere = 'hinweis' WHERE preflight_id = $1`, [preflightId]),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        await appClient.query('RESET ROLE').catch(() => undefined);
        await appClient.end();
      }
    });
  });
});
