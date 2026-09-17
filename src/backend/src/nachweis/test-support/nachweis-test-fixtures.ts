import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import request from 'supertest';
import { expect } from 'vitest';
import { Propagation, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import type { StammdatenTestApp } from '../../stammdaten/test-support/stammdaten-test-app';
import type { SecurityContext } from '../../common/security/security-context';

/**
 * Gemeinsame Test-Fixtures für `nachweis/**`-Integrationstests — Muster
 * `berechnung/berechnungslauf.integration.spec.ts` (dort als
 * Describe-Block-lokale Closures; hier als eigenständige Funktionen, weil
 * MEHRERE `nachweis/*.integration.spec.ts`-Dateien dieselbe Fixture-Kette
 * (Endkunde → mvet → Berechnungslauf) brauchen, s. `.claude/rules/tests.md`
 * „Sprechende Testnamen" — Duplizierung dieser Kette in jeder Datei wäre
 * genau die Art Kopie, die bei einer künftigen Schema-/API-Änderung
 * divergiert).
 */

export function idempotencyKey(): string {
  return randomUUID();
}

/**
 * KRITISCH für Testisolation (`.claude/rules/tests.md`: "Scope deine
 * DB-Assertions auf die jeweils erzeugte Entität"): `nachweis`s
 * Umfangsregel (`findScopePaare()`) liest ALLE nicht-ersetzten
 * `analytics.berechnungslauf`-Zeilen mit Periodenüberlappung zum
 * Förderjahr — REGARDLESS welcher Test sie angelegt hat. Zwei Tests, die
 * dasselbe Kalenderjahr verwenden, würden sich sonst GEGENSEITIG in den
 * Scope holen (reihenfolgenabhängiger Flaky-Test, GENAU die im Auftrag
 * benannte Fehlerklasse). Jeder Test bekommt daher ein EIGENES,
 * monoton aufsteigendes Testjahr — KEIN Kalenderjahr wird zweimal verwendet.
 */
let naechstesJahr = 2030;
export function neuesTestJahr(): number {
  const jahr = naechstesJahr;
  naechstesJahr += 1;
  return jahr;
}

export async function legeEndkundeAn(testApp: StammdatenTestApp, betriebToken: string, namenSuffix: string): Promise<string> {
  const response = await request(testApp.httpServer)
    .post('/stammdaten/endkunden')
    .set('Authorization', `Bearer ${betriebToken}`)
    .set('Idempotency-Key', idempotencyKey())
    .send({ stammdatenPii: { name: `Testkunde Nachweis ${namenSuffix}`, anschrift: 'Musterstraße 1' } });
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

/** Legt eine Messkonzept-Version MIT genau einem Energieträger an und liefert die `mvet_id` (per SQL — die API-Response trägt keine `id` je Energieträger-Zeile, Muster `berechnung`-Integrationstest). */
export async function legeMvetAn(
  testApp: StammdatenTestApp,
  betriebToken: string,
  dbClient: Client,
  endkundeId: string,
  input: {
    readonly baselineWert: number;
    readonly energietraeger?: string;
    readonly energietraegerSubstitution?: boolean;
    /** V0076 — steuert, ob der Lauf die Koeffizienten setzt oder an eine Vermessung anpasst. Default: vereinfacht. */
    readonly typ?: 'vereinfacht' | 'standard' | 'alternativ';
  } = { baselineWert: 20000 },
): Promise<string> {
  const response = await request(testApp.httpServer)
    .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
    .set('Authorization', `Bearer ${betriebToken}`)
    .set('Idempotency-Key', idempotencyKey())
    .send({
      // Default 'vereinfacht': Die Fixture erfasst keine Baseline-Periode, also
      // gibt es keine Vermessung, an die sich Koeffizienten anpassen liessen
      // (V0076). Tests des Standard-Pfads setzen `typ` und legen selbst eine an.
      typ: input.typ ?? 'vereinfacht',
      systemgrenze: 'Gebäude Musterhalle',
      systembeschreibung: 'Testsystem',
      bereinigungsverfahren: 'Gradtagzahlverfahren',
      messgeraeteWahl: 'Fernauslesbare Zähler',
      geraeteerkennungsVerfahren: 'Direktmessung',
      energietraeger: [
        {
          energietraeger: input.energietraeger ?? 'gas',
          baselineWert: input.baselineWert,
          baselineEinheit: 'kWh',
          ...(input.energietraegerSubstitution !== undefined ? { energietraegerSubstitution: input.energietraegerSubstitution } : {}),
        },
      ],
    });
  expect(response.status).toBe(201);

  const row = await dbClient.query(
    `SELECT mvet.id
       FROM energy.messkonzept_version_energietraeger mvet
       JOIN energy.messkonzept_version mv ON mv.id = mvet.messkonzept_version_id
       JOIN energy.messkonzept mk ON mk.id = mv.messkonzept_id
      WHERE mk.endkunde_id = $1
      ORDER BY mvet.created_at DESC
      LIMIT 1`,
    [endkundeId],
  );
  return (row.rows[0] as { id: string }).id;
}

/** Legt ein `energy.system` an (Voraussetzung fuer die mvet<->System-Zuordnung, V0028) und liefert die `id`. */
export async function legeSystemAn(testApp: StammdatenTestApp, betriebToken: string, endkundeId: string, bezeichnung: string): Promise<string> {
  const response = await request(testApp.httpServer)
    .post('/stammdaten/systeme')
    .set('Authorization', `Bearer ${betriebToken}`)
    .set('Idempotency-Key', idempotencyKey())
    .send({ endkundeId, bezeichnung, systemgrenze: 'Testsystemgrenze' });
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

/**
 * Verknuepft `mvetId` <-> `systemId` DIREKT per SQL (V0028,
 * `energy.messkonzept_version_energietraeger_system`) — es gibt (bewusst,
 * s. Migrations-Kopf) noch KEINEN HTTP-Schreibpfad fuer diese Zuordnung.
 * `endkunde_id` wird — wie im Produktionscode (`EnergyMesskonzeptRepository.
 * insertEnergietraeger()`) — aus der mvet-Zeile SELBST abgeleitet, NICHT
 * als separater Parameter uebergeben (Mandantentreue-Konsistenz).
 */
export async function verknuepfeMvetMitSystem(dbClient: Client, mvetId: string, systemId: string): Promise<void> {
  await dbClient.query(
    `INSERT INTO energy.messkonzept_version_energietraeger_system (mvet_id, system_id, endkunde_id)
       SELECT mvet.id, sys.id, mvet.endkunde_id
         FROM energy.messkonzept_version_energietraeger mvet, energy.system sys
        WHERE mvet.id = $1 AND sys.id = $2`,
    [mvetId, systemId],
  );
}

/** Legt einen `energy.anschlussnutzer` an und liefert die `id`. */
export async function legeAnschlussnutzerAn(testApp: StammdatenTestApp, betriebToken: string, endkundeId: string, namenSuffix: string): Promise<string> {
  const response = await request(testApp.httpServer)
    .post('/stammdaten/anschlussnutzer')
    .set('Authorization', `Bearer ${betriebToken}`)
    .set('Idempotency-Key', idempotencyKey())
    .send({ endkundeId, stammdatenPii: { name: `Testnutzer ${namenSuffix}` } });
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

/** Legt ein `energy.nutzungsverhaeltnis` an (`gueltigVon` ISO-Datetime) und liefert die `id`. */
export async function legeNutzungsverhaeltnisAn(
  testApp: StammdatenTestApp,
  betriebToken: string,
  input: { readonly endkundeId: string; readonly anschlussnutzerId: string; readonly systemId: string; readonly gueltigVon: string },
): Promise<string> {
  const response = await request(testApp.httpServer)
    .post('/stammdaten/nutzungsverhaeltnisse')
    .set('Authorization', `Bearer ${betriebToken}`)
    .set('Idempotency-Key', idempotencyKey())
    .send({ endkundeId: input.endkundeId, anschlussnutzerId: input.anschlussnutzerId, systemId: input.systemId, rolle: 'mieter', gueltigVon: input.gueltigVon });
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

/** Beendet ein `energy.nutzungsverhaeltnis` (`gueltigVon` < `gueltigBis` ISO-Datetime, s. Kontrollfluss `EnergyNutzungsverhaeltnisRepository.beenden()`). */
export async function beendeNutzungsverhaeltnis(testApp: StammdatenTestApp, betriebToken: string, nutzungsverhaeltnisId: string, gueltigBis: string): Promise<void> {
  const response = await request(testApp.httpServer)
    .patch(`/stammdaten/nutzungsverhaeltnisse/${nutzungsverhaeltnisId}`)
    .set('Authorization', `Bearer ${betriebToken}`)
    .set('Idempotency-Key', idempotencyKey())
    .send({ gueltigBis });
  expect(response.status).toBe(200);
}

/**
 * Sperrt/loescht einen Anschlussnutzer DIREKT per SQL — `EnergyAnschlussnutzerRepository`
 * kennt (Stand V0029, s. dortiger Migrationskommentar) KEINE `sperren()`/
 * `loeschen()`-Methode; identisches Muster zu `sperreEndkundeOhneGrund()`.
 */
export async function setzeAnschlussnutzerStatus(dbClient: Client, anschlussnutzerId: string, status: 'gesperrt' | 'geloescht'): Promise<void> {
  await dbClient.query(`UPDATE energy.anschlussnutzer SET verarbeitungs_status = $2 WHERE id = $1`, [anschlussnutzerId, status]);
}

/** `jahr` s. `neuesTestJahr()`-Kommentar — bestimmt `periodeVon/periodeBis` (Januar des jeweiligen Testjahres), sofern nicht per `overrides` ueberschrieben. */
export function berechnungslaufBody(endkundeId: string, mvetId: string, jahr: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    endkundeId,
    mvetId,
    periodeVon: `${jahr}-01-01`,
    periodeBis: `${jahr}-02-01`,
    grundlastAnteil: 0.2,
    stationRef: `TEST-${randomUUID()}`,
    gtzBaseOverride: 3500,
    ...overrides,
  };
}

export async function starteBerechnungslauf(
  testApp: StammdatenTestApp,
  betriebToken: string,
  body: Record<string, unknown>,
): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
  const response = await request(testApp.httpServer)
    .post('/berechnung/laeufe')
    .set('Authorization', `Bearer ${betriebToken}`)
    .set('Idempotency-Key', idempotencyKey())
    .send(body);
  return { status: response.status, body: response.body as Record<string, unknown> };
}

/** `jahr` s. `neuesTestJahr()`-Kommentar — Foerderjahr Januar-April desselben Testjahres, sofern nicht per `overrides` ueberschrieben. */
export function foerderjahrBody(jahr: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code: `FJ-TEST-${jahr}-${randomUUID().slice(0, 8)}`,
    vorhabenRef: 'AZ-TEST-0001',
    nummer: 1,
    vonMonat: `${jahr}-01-01`,
    bisMonat: `${jahr}-04-01`,
    definitionQuelle: 'kalenderjahr',
    ...overrides,
  };
}

export async function legeFoerderjahrAn(
  testApp: StammdatenTestApp,
  betriebToken: string,
  jahr: number,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await request(testApp.httpServer)
    .post('/nachweis/foerderjahre')
    .set('Authorization', `Bearer ${betriebToken}`)
    .set('Idempotency-Key', idempotencyKey())
    .send(foerderjahrBody(jahr, overrides));
  expect(response.status).toBe(201);
  return (response.body as { id: string }).id;
}

/**
 * Sperrt einen Endkunden DIREKT per SQL mit einem Art.-18-Grund — am
 * HTTP-Pfad vorbei, weil die Nachweis-Tests den SPERRZUSTAND als
 * Ausgangslage brauchen, nicht den Sperrvorgang als Prueflingsobjekt.
 *
 * `neuerhebungFortsetzen` (Auflage C-8, V0087) ist bei lit. b und lit. d
 * Pflicht — `ck_endkunde_neuerhebung_entschieden` laesst die Zeile sonst
 * nicht zu. Die Vorgabe `true` bildet den Regelfall ab: die Messung laeuft
 * waehrend der Klaerung weiter, ausgewertet wird sie nicht. Tests, die die
 * Gegenentscheidung brauchen, uebergeben `false`.
 */
export async function sperreEndkundeMitGrund(
  dbClient: Client,
  endkundeId: string,
  grund: string,
  neuerhebungFortsetzen = true,
): Promise<void> {
  const brauchtEntscheidung = grund === 'art18_1b_unrechtmaessig' || grund === 'art18_1d_widerspruch';
  await dbClient.query(
    `UPDATE energy.endkunde
        SET verarbeitungs_status = 'gesperrt',
            einschraenkung_grund_code = $2,
            gesperrt_seit = now(),
            neuerhebung_fortsetzen = $3
      WHERE id = $1`,
    [endkundeId, grund, brauchtEntscheidung ? neuerhebungFortsetzen : null],
  );
}

/** Sperrt OHNE Grund (Bestandsdaten-Fall, fail-closed FJ-07c) — moeglich, weil `einschraenkung_grund_code` NULLABLE ist (V0024, Bestandsschutz). */
export async function sperreEndkundeOhneGrund(dbClient: Client, endkundeId: string): Promise<void> {
  await dbClient.query(`UPDATE energy.endkunde SET verarbeitungs_status = 'gesperrt' WHERE id = $1`, [endkundeId]);
}

export function betriebSecurityContext(sub = 'betrieb-sub'): SecurityContext {
  return { sub, actorTyp: 'benutzer', roles: ['betrieb'], azp: 'edms-bff' };
}

/**
 * Ruft `fn` INNERHALB einer ECHTEN, ambienten `Propagation.Required`-
 * Transaktion auf — exakt das, was `TransactionInterceptor` für JEDEN
 * HTTP-Request öffnet (s. dortiger Klassen-Kommentar). Für Tests, die einen
 * Service (`PreflightService`/`EinsparlaufService`) DIREKT aus dem
 * kompilierten Nest-Modulbaum aufrufen (`testApp.app.get(...)`), OHNE über
 * `supertest`/den HTTP-Layer zu gehen — nötig, um `synthetic` explizit als
 * Parameter zu übergeben (bypässt `SyntheticOnlyInterceptor`s IMMER-true,
 * s. `preflight-gruen.integration.spec.ts`-Kopfkommentar), während
 * `AuditService.append()`/alle Repository-Queries dennoch eine gültige
 * `TransactionHost.tx` vorfinden (sonst würfe `EntityManager.query()` "no
 * transaction found" o. Ä.).
 */
export async function mitTransaktion<T>(testApp: StammdatenTestApp, fn: () => Promise<T>): Promise<T> {
  const txHost = testApp.app.get<TransactionHost<TransactionalAdapterTypeOrm>>(TransactionHost);
  return txHost.withTransaction(Propagation.Required, fn);
}
