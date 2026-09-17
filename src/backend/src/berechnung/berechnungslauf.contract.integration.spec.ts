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

/**
 * Contract-Test: validiert die REALEN Responses der Berechnungslauf-Routen
 * gegen `schemas/openapi/berechnung.openapi.yaml` (Muster
 * `messwerte.contract.integration.spec.ts`/`standort.contract.integration.
 * spec.ts`, `.claude/rules/tests.md` "Jeder neue Endpoint bekommt einen
 * Contract-Test gegen OpenAPI-Spec"). `mvetId` kommt — wie im begleitenden
 * `berechnungslauf.integration.spec.ts` — per Direkt-SQL (die API-Response
 * von `POST .../messkonzept/versionen` trägt bewusst keine `id` je
 * Energieträger-Zeile, dokumentierter Stammdaten-Vertrag, s. dortiger
 * Kommentar).
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

const OPENAPI_CONTRACT_PATH = path.join(findRepoRoot(process.cwd()), 'schemas/openapi/berechnung.openapi.yaml');

interface OpenApiDocument {
  readonly components: {
    readonly schemas: Record<string, unknown>;
  };
}

function loadContractSchemas(): Record<string, unknown> {
  const raw = readFileSync(OPENAPI_CONTRACT_PATH, 'utf8');
  const document = parse(raw) as OpenApiDocument;
  return document.components.schemas;
}

function compileContractValidator(schemas: Record<string, unknown>, schemaName: string): ValidateFunction {
  if (schemas[schemaName] === undefined) {
    throw new Error(`OpenAPI-Contract enthält kein Schema "${schemaName}" (schemas/openapi/berechnung.openapi.yaml).`);
  }

  const ajv = new Ajv2020({ strict: false });
  const rootSchema = {
    $id: `edms-berechnung-contract-${schemaName}-${randomUUID()}`,
    $ref: `#/components/schemas/${schemaName}`,
    components: { schemas },
  };

  return ajv.compile(rootSchema);
}

describe('Berechnungslauf-Contract-Validierung gegen schemas/openapi/berechnung.openapi.yaml', () => {
  let testApp: StammdatenTestApp;
  let schemas: Record<string, unknown>;
  let betriebToken: string;
  let dbClient: Client;

  beforeAll(async () => {
    schemas = loadContractSchemas();
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
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

  async function legeEndkundeUndMvetAn(namenSuffix: string): Promise<{ endkundeId: string; mvetId: string }> {
    const endkundeResponse = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ stammdatenPii: { name: `Testkunde Berechnung-Contract ${namenSuffix}`, anschrift: 'Weg 1' } });
    expect(endkundeResponse.status).toBe(201);
    const endkundeId = (endkundeResponse.body as { id: string }).id;

    const versionResponse = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        typ: 'vereinfacht',
        systemgrenze: 'Gebäude',
        systembeschreibung: 'Test',
        bereinigungsverfahren: 'Gradtagzahlverfahren',
        messgeraeteWahl: 'Fernauslesbare Zähler',
        geraeteerkennungsVerfahren: 'Direktmessung',
        energietraeger: [{ energietraeger: 'gas', baselineWert: 20000, baselineEinheit: 'kWh' }],
      });
    expect(versionResponse.status).toBe(201);

    const mvetRow = await dbClient.query(
      `SELECT mvet.id
         FROM energy.messkonzept_version_energietraeger mvet
         JOIN energy.messkonzept_version mv ON mv.id = mvet.messkonzept_version_id
         JOIN energy.messkonzept mk ON mk.id = mv.messkonzept_id
        WHERE mk.endkunde_id = $1
        ORDER BY mvet.created_at DESC
        LIMIT 1`,
      [endkundeId],
    );
    return { endkundeId, mvetId: (mvetRow.rows[0] as { id: string }).id };
  }

  it('POST /berechnung/laeufe entspricht BerechnungslaufAntwort (voller Erfolgspfad, 201)', async () => {
    const { endkundeId, mvetId } = await legeEndkundeUndMvetAn('Erfolg');
    const validate = compileContractValidator(schemas, 'BerechnungslaufAntwort');

    const response = await request(testApp.httpServer)
      .post('/berechnung/laeufe')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        endkundeId,
        mvetId,
        periodeVon: '2027-01-01',
        periodeBis: '2027-02-01',
        grundlastAnteil: 0.2,
        stationRef: 'CONTRACT-TEST-ERFOLG',
        gtzBaseOverride: 3500,
      });

    expect(response.status).toBe(201);
    expect(response.headers['content-type']).toContain('application/json');
    expect(validate(response.body)).toBe(true);
  });

  it('GET /berechnung/laeufe/{id} entspricht BerechnungslaufAntwort', async () => {
    const { endkundeId, mvetId } = await legeEndkundeUndMvetAn('GetErfolg');
    const validate = compileContractValidator(schemas, 'BerechnungslaufAntwort');

    const createResponse = await request(testApp.httpServer)
      .post('/berechnung/laeufe')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        endkundeId,
        mvetId,
        periodeVon: '2027-01-01',
        periodeBis: '2027-02-01',
        grundlastAnteil: 0.2,
        stationRef: 'CONTRACT-TEST-GET',
        gtzBaseOverride: 3500,
      });
    expect(createResponse.status).toBe(201);
    const laufId = (createResponse.body as { id: string }).id;

    const response = await request(testApp.httpServer)
      .get(`/berechnung/laeufe/${laufId}`)
      .set('Authorization', `Bearer ${betriebToken}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(validate(response.body)).toBe(true);
  });

  it('POST /berechnung/laeufe mit unbekannter mvetId entspricht dem Problem-Schema (404)', async () => {
    const { endkundeId } = await legeEndkundeUndMvetAn('Problem404');
    const validate = compileContractValidator(schemas, 'Problem');

    const response = await request(testApp.httpServer)
      .post('/berechnung/laeufe')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        endkundeId,
        mvetId: randomUUID(),
        periodeVon: '2027-01-01',
        periodeBis: '2027-02-01',
        grundlastAnteil: 0.2,
        stationRef: 'CONTRACT-TEST-404',
        gtzBaseOverride: 3500,
      });

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(validate(response.body)).toBe(true);
  });

  it('POST /berechnung/laeufe OHNE Idempotency-Key entspricht dem Problem-Schema (400)', async () => {
    const validate = compileContractValidator(schemas, 'Problem');

    const response = await request(testApp.httpServer)
      .post('/berechnung/laeufe')
      .set('Authorization', `Bearer ${betriebToken}`)
      .send({
        endkundeId: randomUUID(),
        mvetId: randomUUID(),
        periodeVon: '2027-01-01',
        periodeBis: '2027-02-01',
        grundlastAnteil: 0.2,
        stationRef: 'CONTRACT-TEST-400',
      });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(validate(response.body)).toBe(true);
  });

  it('GET /berechnung/parametervorschlag entspricht BerechnungParametervorschlag', async () => {
    // Der Vorschlag ist die Vorlage fuer das Anlege-Formular: Jedes Feld, das
    // die Oberflaeche erwartet und der Server nicht liefert, faellt hier auf
    // — und nicht erst an einem leeren Eingabefeld.
    const { endkundeId, mvetId } = await legeEndkundeUndMvetAn('Vorschlag');
    const validate = compileContractValidator(schemas, 'BerechnungParametervorschlag');

    const response = await request(testApp.httpServer)
      .get('/berechnung/parametervorschlag')
      .query({ endkundeId, mvetId })
      .set('Authorization', `Bearer ${betriebToken}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(validate(response.body)).toBe(true);
  });
});
