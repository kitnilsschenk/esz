import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import {
  berechnungslaufBody,
  betriebSecurityContext,
  legeEndkundeAn,
  legeMvetAn,
  mitTransaktion,
  neuesTestJahr,
  starteBerechnungslauf,
} from './test-support/nachweis-test-fixtures';
import { PreflightService } from './preflight.service';
import { EinsparlaufService } from './einsparlauf.service';
import { fensterAusMonaten, NachweisFoerderjahrRepository } from './persistence/nachweis-foerderjahr.repository';

/**
 * Seit der A-1-Freigabe (2026-09-09) braucht diese Datei KEINEN Modul-Mock
 * mehr: `FJ-08` prüfte, ob der DWD-Quellenvermerk noch ein Platzhalter ist,
 * und das ist er nicht mehr. Der Test läuft damit gegen den ECHTEN
 * Vermerkstext — was er vorher nur nachstellen konnte.
 */

/**
 * `FJ-09` wird — ANDERS als `FJ-08` — NICHT gemockt, sondern durch den
 * expliziten `synthetic:false`-Parameter neutralisiert: alle Aufrufe in
 * dieser Datei gehen DIREKT gegen `PreflightService`/`EinsparlaufService`
 * (`testApp.app.get(...)`, `mitTransaktion()`), NICHT über HTTP/den
 * `SyntheticOnlyInterceptor` (der `request.synthetic` IMMER auf `true`
 * zwingt, solange `EDMS_SYNTHETIC_ONLY=true` gilt — s. dortigen
 * Klassen-Kommentar).
 */
describe('Preflight/Einsparlauf — GRUENER Pfad (ADR-0007 D4/D1, FJ-08 gemockt + synthetic:false)', () => {
  let testApp: StammdatenTestApp;
  let dbClient: Client;

  beforeAll(async () => {
    testApp = await startStammdatenTestApp();
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
  }, 120_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  it('leeres Foerderjahr (kein Scope) wird GRUEN (null Blocker) unter neutralisierten FJ-08/FJ-09', async () => {
    const jahr = neuesTestJahr();
    const foerderjahrId = await legeFoerderjahrViaService(testApp, jahr, `FJ-GRUEN-LEER-${jahr}`);

    const preflightService = testApp.app.get(PreflightService);
    const ergebnis = await mitTransaktion(testApp, () =>
      preflightService.ausfuehren({ foerderjahrId, profilCode: 'foerderjahr_preflight_de02' }, betriebSecurityContext(), false),
    );

    expect(ergebnis.preflight.ergebnis).toBe('gruen');
    expect(ergebnis.preflight.blockerAnzahl).toBe(0);
    expect(ergebnis.preflight.synthetic).toBe(false);
    expect(ergebnis.befunde).toHaveLength(0);
  });

  it('Endkunde mit Lauf (ohne Messwerte, daher nicht_ausweisbar): PREFLIGHT gruen (FJ-03 ist nur ein Hinweis) UND der art=foerderjahr_nachweis-Einsparlauf wird erfolgreich angelegt', async () => {
    const jahr = neuesTestJahr();
    const betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, 'GruenerPfad');
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
    const laufResponse = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetId, jahr));
    expect(laufResponse.status).toBe(201);
    const berechnungslaufId = laufResponse.body['id'] as string;

    const foerderjahrId = await legeFoerderjahrViaService(testApp, jahr, `FJ-GRUEN-PAAR-${jahr}`);

    const preflightService = testApp.app.get(PreflightService);
    const preflightErgebnis = await mitTransaktion(testApp, () =>
      preflightService.ausfuehren({ foerderjahrId, profilCode: 'foerderjahr_preflight_de02' }, betriebSecurityContext(), false),
    );
    expect(preflightErgebnis.preflight.ergebnis).toBe('gruen');
    expect(preflightErgebnis.preflight.blockerAnzahl).toBe(0);
    // FJ-03 (hinweis) fuer den nicht_ausweisbaren Monat -> KEIN Blocker, aber SICHTBAR.
    const fj03 = preflightErgebnis.befunde.filter((b) => b.regelCode === 'FJ-03');
    expect(fj03).toHaveLength(1);
    expect(fj03[0]?.schwere).toBe('hinweis');

    const einsparlaufService = testApp.app.get(EinsparlaufService);
    const lauf = await mitTransaktion(testApp, () =>
      einsparlaufService.starten(
        { foerderjahrId, preflightId: preflightErgebnis.preflight.id, art: 'foerderjahr_nachweis' },
        betriebSecurityContext(),
        false,
      ),
    );

    expect(lauf.ergebnisse).toHaveLength(1);
    const [zeile] = lauf.ergebnisse;
    expect(zeile?.endkundeId).toBe(endkundeId);
    expect(zeile?.energietraeger).toBe('gas');
    // Ohne Messwerte ist der einzige gebundene Monat nicht_ausweisbar (0%
    // Abdeckung) -> unter dem 75%-Floor -> status=nicht_nachweisbar (die
    // Foerderjahr-VOLLSTAENDIGKEIT ["gruen"] und die PAAR-Nachweisbarkeit
    // sind zwei verschiedene Achsen, s. Design-Entscheidungen).
    expect(zeile?.status).toBe('nicht_nachweisbar');
    expect(zeile?.einsparungKwhEndenergie).toBeNull();
    expect(lauf.gebundeneLaeufeAnzahl).toBe(1);
    expect(lauf.monateGebunden).toBe(1);
    expect(lauf.umfangPaareAnzahl).toBe(1);

    // D7 — Retention-Flag MONOTON gesetzt, bei ERSTELLUNG des Einspar-Laufs.
    const retentionRow = await dbClient.query(
      'SELECT nachweis_gebunden, nachweis_referenz FROM analytics.lauf_retention_status WHERE lauf_id = $1',
      [berechnungslaufId],
    );
    expect(retentionRow.rows[0]).toMatchObject({ nachweis_gebunden: true, nachweis_referenz: `einsparlauf:${lauf.id}` });

    // D2 — bindungs_hash ist ein echtes SHA-256-Siegel (32 Byte).
    const bindungsHashRow = await dbClient.query('SELECT octet_length(bindungs_hash) AS len FROM nachweis.einsparlauf WHERE id = $1', [
      lauf.id,
    ]);
    expect((bindungsHashRow.rows[0] as { len: number }).len).toBe(32);

    // Audit-Kette: angefordert + abgeschlossen, KEIN endkunde_id im Kontext.
    const auditRows = await dbClient.query(
      `SELECT event_typ, kontext FROM audit.event
        WHERE event_typ LIKE 'einsparlauf.nachweis.%' AND kontext->>'preflight_id' = $1
        ORDER BY seq ASC`,
      [preflightErgebnis.preflight.id],
    );
    expect(auditRows.rows.map((r: { event_typ: string }) => r.event_typ)).toEqual([
      'einsparlauf.nachweis.angefordert',
      'einsparlauf.nachweis.abgeschlossen',
    ]);
    for (const row of auditRows.rows as { kontext: Record<string, unknown> }[]) {
      expect(Object.keys(row.kontext)).not.toContain('endkunde_id');
      expect(JSON.stringify(row.kontext)).not.toContain(endkundeId);
    }
  });

  it('art=zwischenstand: erfolgreich auch OHNE gruenen Preflight (D4)', async () => {
    const jahr = neuesTestJahr();
    const foerderjahrId = await legeFoerderjahrViaService(testApp, jahr, `FJ-ZWISCHEN-${jahr}`);
    const preflightService = testApp.app.get(PreflightService);
    // synthetic:true (Default-Verhalten, FJ-09 feuert) -> preflight ROT.
    const preflightErgebnis = await mitTransaktion(testApp, () =>
      preflightService.ausfuehren({ foerderjahrId, profilCode: 'foerderjahr_preflight_de02' }, betriebSecurityContext(), true),
    );
    expect(preflightErgebnis.preflight.ergebnis).toBe('rot');

    const einsparlaufService = testApp.app.get(EinsparlaufService);
    const lauf = await mitTransaktion(testApp, () =>
      einsparlaufService.starten(
        { foerderjahrId, preflightId: preflightErgebnis.preflight.id, art: 'zwischenstand' },
        betriebSecurityContext(),
        true,
      ),
    );
    expect(lauf.art).toBe('zwischenstand');
    expect(lauf.ergebnisse).toHaveLength(0); // kein Scope in diesem frischen Testjahr
  });

  it('art=foerderjahr_nachweis OHNE gruenen Preflight wird abgewiesen (409, fail-closed D4)', async () => {
    const jahr = neuesTestJahr();
    const foerderjahrId = await legeFoerderjahrViaService(testApp, jahr, `FJ-ABGEWIESEN-${jahr}`);
    const preflightService = testApp.app.get(PreflightService);
    const preflightErgebnis = await mitTransaktion(testApp, () =>
      preflightService.ausfuehren({ foerderjahrId, profilCode: 'foerderjahr_preflight_de02' }, betriebSecurityContext(), true),
    );
    expect(preflightErgebnis.preflight.ergebnis).toBe('rot');

    const einsparlaufService = testApp.app.get(EinsparlaufService);
    await expect(
      mitTransaktion(testApp, () =>
        einsparlaufService.starten(
          { foerderjahrId, preflightId: preflightErgebnis.preflight.id, art: 'foerderjahr_nachweis' },
          betriebSecurityContext(),
          true,
        ),
      ),
    ).rejects.toMatchObject({ fehlerCode: 'preflight_nicht_gruen' });
  });
});

async function legeFoerderjahrViaService(testApp: StammdatenTestApp, jahr: number, code: string): Promise<string> {
  return mitTransaktion(testApp, async () => {
    const repo = testApp.app.get(NachweisFoerderjahrRepository);
    const fj = await repo.insert({
      id: randomUUID(),
      code,
      vorhabenRef: 'AZ-TEST-GRUEN',
      nummer: 1,
      ...fensterAusMonaten(`${jahr}-01-01`, `${jahr}-01-01`),
      definitionQuelle: 'kalenderjahr',
      bescheidRef: null,
    });
    return fj.id;
  });
}
