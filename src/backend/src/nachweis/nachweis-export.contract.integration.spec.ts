import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import { Client } from 'pg';
import request from 'supertest';
import { parse } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import {
  berechnungslaufBody,
  betriebSecurityContext,
  idempotencyKey,
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
 * Seit der A-1-Freigabe (2026-09-09) ohne Modul-Mock: `FJ-08` feuert nicht
 * mehr, weil der DWD-Quellenvermerk kein Platzhalter mehr ist.
 */

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('Repo-Root nicht gefunden (pnpm-workspace.yaml fehlt im Pfadbaum)');
    }
    dir = parent;
  }
}

const OPENAPI_CONTRACT_PATH = path.join(findRepoRoot(process.cwd()), 'schemas/openapi/nachweis.openapi.yaml');

interface OpenApiDocument {
  readonly components: { readonly schemas: Record<string, unknown> };
}

function loadContractSchemas(): Record<string, unknown> {
  return (parse(readFileSync(OPENAPI_CONTRACT_PATH, 'utf8')) as OpenApiDocument).components.schemas;
}

function compileContractValidator(schemas: Record<string, unknown>, schemaName: string): ValidateFunction {
  if (schemas[schemaName] === undefined) {
    throw new Error(`OpenAPI-Contract enthält kein Schema "${schemaName}" (schemas/openapi/nachweis.openapi.yaml).`);
  }
  const ajv = new Ajv2020({ strict: false });
  return ajv.compile({
    $id: `edms-nachweis-contract-${schemaName}-${randomUUID()}`,
    $ref: `#/components/schemas/${schemaName}`,
    components: { schemas },
  });
}

/** Ajv-Fehler lesbar machen — sonst steht im Report nur „false". */
function fehlerText(validate: ValidateFunction): string {
  return (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ''}`).join('; ');
}

describe('Nachweis-Contract-Validierung gegen schemas/openapi/nachweis.openapi.yaml', () => {
  let testApp: StammdatenTestApp;
  let dbClient: Client;
  let schemas: Record<string, unknown>;
  let betriebToken: string;

  beforeAll(async () => {
    schemas = loadContractSchemas();
    testApp = await startStammdatenTestApp();
    dbClient = new Client({ connectionString: testApp.container.getConnectionUri() });
    await dbClient.connect();
    betriebToken = await testApp.signToken('betrieb-contract-sub', ['betrieb']);
  }, 180_000);

  afterAll(async () => {
    await dbClient?.end().catch(() => undefined);
    await stopStammdatenTestApp(testApp);
  });

  /** Fördermittel-Kette bis zum grünen Einsparlauf (Muster `nachweis-export.integration.spec.ts`). */
  async function legeEinsparlaufAn(suffix: string): Promise<string> {
    const jahr = neuesTestJahr();
    const endkundeId = await legeEndkundeAn(testApp, betriebToken, suffix);
    const mvetId = await legeMvetAn(testApp, betriebToken, dbClient, endkundeId);
    const laufResponse = await starteBerechnungslauf(testApp, betriebToken, berechnungslaufBody(endkundeId, mvetId, jahr));
    expect(laufResponse.status).toBe(201);

    const foerderjahrId = await mitTransaktion(testApp, async () => {
      const fj = await testApp.app.get(NachweisFoerderjahrRepository).insert({
        id: randomUUID(),
        code: `FJ-CONTRACT-${suffix}`,
        vorhabenRef: 'AZ-TEST-CONTRACT',
        nummer: 1,
        ...fensterAusMonaten(`${String(jahr)}-01-01`, `${String(jahr)}-01-01`),
        definitionQuelle: 'kalenderjahr',
        bescheidRef: null,
      });
      return fj.id;
    });

    const preflight = await mitTransaktion(testApp, () =>
      testApp.app
        .get(PreflightService)
        .ausfuehren({ foerderjahrId, profilCode: 'foerderjahr_preflight_de02' }, betriebSecurityContext(), false),
    );
    expect(preflight.preflight.ergebnis).toBe('gruen');

    const lauf = await mitTransaktion(testApp, () =>
      testApp.app
        .get(EinsparlaufService)
        .starten({ foerderjahrId, preflightId: preflight.preflight.id, art: 'foerderjahr_nachweis' }, betriebSecurityContext(), false),
    );
    return lauf.id;
  }

  async function erzeugeExport(einsparlaufId: string): Promise<Record<string, unknown>> {
    const response = await request(testApp.httpServer)
      .post(`/nachweis/einsparlaeufe/${einsparlaufId}/exporte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({});
    expect(response.status).toBe(201);
    return response.body as Record<string, unknown>;
  }

  it('POST /nachweis/einsparlaeufe/{id}/exporte entspricht NachweisExportAntwort', async () => {
    const validate = compileContractValidator(schemas, 'NachweisExportAntwort');
    const koerper = await erzeugeExport(await legeEinsparlaufAn('Erzeugen'));

    expect(validate(koerper), fehlerText(validate)).toBe(true);
  });

  it('GET /nachweis/exporte/{id} entspricht NachweisExportAntwort', async () => {
    // Der Abruf ist der Weg, den die Detailseite geht — dort trat der
    // Puffer-Absturz auf.
    const validate = compileContractValidator(schemas, 'NachweisExportAntwort');
    const erzeugt = await erzeugeExport(await legeEinsparlaufAn('Abrufen'));

    const response = await request(testApp.httpServer)
      .get(`/nachweis/exporte/${String(erzeugt['id'])}`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(response.status).toBe(200);
    expect(validate(response.body), fehlerText(validate)).toBe(true);
  });

  it('POST /nachweis/exporte/{id}/einreichungen entspricht Einreichung', async () => {
    const validate = compileContractValidator(schemas, 'Einreichung');
    const erzeugt = await erzeugeExport(await legeEinsparlaufAn('Vermerken'));

    const response = await request(testApp.httpServer)
      .post(`/nachweis/exporte/${String(erzeugt['id'])}/einreichungen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ art: 'verwendungsnachweis', uebermittlungsweg: 'bscw_manuell', uebermitteltAt: new Date().toISOString() });
    expect(response.status).toBe(201);
    expect(validate(response.body), fehlerText(validate)).toBe(true);

    // Die eingefrorene Pruefsumme MUSS die des Exports sein — sonst belegt der
    // Vermerk eine andere Lieferung als die, die rausging.
    expect((response.body as Record<string, unknown>)['manifestHash']).toBe(erzeugt['manifestHash']);
  });

  it('GET /nachweis/einreichungen/{id} entspricht Einreichung', async () => {
    const validate = compileContractValidator(schemas, 'Einreichung');
    const erzeugt = await erzeugeExport(await legeEinsparlaufAn('Lesen'));
    const vermerkt = await request(testApp.httpServer)
      .post(`/nachweis/exporte/${String(erzeugt['id'])}/einreichungen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ art: 'zwischennachweis', uebermittlungsweg: 'email_geschuetzt', uebermitteltAt: new Date().toISOString() });
    expect(vermerkt.status).toBe(201);

    const response = await request(testApp.httpServer)
      .get(`/nachweis/einreichungen/${String((vermerkt.body as { id: string }).id)}`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(response.status).toBe(200);
    expect(validate(response.body), fehlerText(validate)).toBe(true);
  });
});
