import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import { Client } from 'pg';
import request from 'supertest';
import { parse } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Contract-Test: validiert die REALEN Responses der neuen TB-04-Ausfall-/
 * Freshness-Routen (ADR-0005 §27, Backend-Lücke 2) gegen
 * `schemas/openapi/stammdaten.openapi.yaml` (Muster
 * `standort.contract.integration.spec.ts`, `.claude/rules/tests.md`).
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

const OPENAPI_CONTRACT_PATH = path.join(findRepoRoot(process.cwd()), 'schemas/openapi/stammdaten.openapi.yaml');

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
    throw new Error(`OpenAPI-Contract enthält kein Schema "${schemaName}" (schemas/openapi/stammdaten.openapi.yaml).`);
  }

  const ajv = new Ajv2020({ strict: false });
  const rootSchema = {
    $id: `edms-stammdaten-contract-${schemaName}-${randomUUID()}`,
    $ref: `#/components/schemas/${schemaName}`,
    components: { schemas },
  };

  return ajv.compile(rootSchema);
}

describe('TB-04-Ausfall-/Freshness-Contract-Validierung gegen schemas/openapi/stammdaten.openapi.yaml (ADR-0005 §27)', () => {
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

  async function legeZaehlerMitMesskanalAn(): Promise<{ zaehlerId: string; messkanalId: string }> {
    const endkundeResponse = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ stammdatenPii: { name: 'Testkunde Ausfall-Contract', anschrift: 'Musterstraße 1, 12345 Musterstadt' } });
    const endkundeId = (endkundeResponse.body as { id: string }).id;

    const systemResponse = await request(testApp.httpServer)
      .post('/stammdaten/systeme')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ endkundeId, bezeichnung: 'Testsystem', systemgrenze: 'Gebäude' });

    const zaehlerResponse = await request(testApp.httpServer)
      .post('/stammdaten/zaehler')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ systemId: (systemResponse.body as { id: string }).id, geraetetyp: 'Testzaehler', energietraeger: 'strom' });
    const zaehlerId = (zaehlerResponse.body as { id: string }).id;

    const messkanalResponse = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ messgroesse: 'Wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });

    return { zaehlerId, messkanalId: (messkanalResponse.body as { id: string }).id };
  }

  async function seedeUeberfaelligenKanalStatus(messkanalId: string): Promise<void> {
    const row = await dbClient.query('SELECT kanal_key FROM energy.messkanal WHERE id = $1', [messkanalId]);
    const kanalKey = (row.rows[0] as { kanal_key: number }).kanal_key;
    const vor100Stunden = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString();
    await dbClient.query(
      `INSERT INTO ingest.kanal_status (messkanal_key, letzter_ts, updated_at) VALUES ($1, $2, now())`,
      [kanalKey, vor100Stunden],
    );
  }

  it('GET /monitoring/ausfaelle entspricht AusfallListe (daten[] aus AusfallListeItem + seite)', async () => {
    const { messkanalId } = await legeZaehlerMitMesskanalAn();
    await seedeUeberfaelligenKanalStatus(messkanalId);

    const validate = compileContractValidator(schemas, 'AusfallListe');
    const response = await request(testApp.httpServer)
      .get('/monitoring/ausfaelle')
      .set('Authorization', `Bearer ${betriebToken}`);

    expect(response.status).toBe(200);
    expect(validate(response.body)).toBe(true);
  });

  it('GET .../zaehler/{id}/freshness entspricht einem Array von MesskanalFreshnessItem (inkl. Empty-State letzteUebertragung=null)', async () => {
    const { zaehlerId } = await legeZaehlerMitMesskanalAn();

    const validate = compileContractValidator(schemas, 'MesskanalFreshnessItem');
    const response = await request(testApp.httpServer)
      .get(`/stammdaten/zaehler/${zaehlerId}/freshness`)
      .set('Authorization', `Bearer ${betriebToken}`);

    expect(response.status).toBe(200);
    const items = response.body as unknown[];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(validate(item)).toBe(true);
    }
  });
});
