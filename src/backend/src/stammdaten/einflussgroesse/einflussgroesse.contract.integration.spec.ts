import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import request from 'supertest';
import { parse } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../test-support/stammdaten-test-app';

/**
 * Contract-Test: validiert die REALEN Responses der Einflussgrößen-Routen
 * (ADR-0006 Teil B, B8/B10) gegen `schemas/openapi/stammdaten.openapi.yaml`
 * (Muster `standort.contract.integration.spec.ts`, `.claude/rules/tests.md`
 * "Jeder neue Endpoint bekommt einen Contract-Test gegen OpenAPI-Spec").
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

describe('Einflussgrößen-Contract-Validierung gegen schemas/openapi/stammdaten.openapi.yaml (ADR-0006 Teil B)', () => {
  let testApp: StammdatenTestApp;
  let schemas: Record<string, unknown>;
  let betriebToken: string;

  beforeAll(async () => {
    schemas = loadContractSchemas();
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
  }, 120_000);

  afterAll(async () => {
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
        stammdatenPii: { name: `Testkunde Einflussgroesse-Contract ${namenSuffix}`, anschrift: 'Musterstraße 1, 12345 Musterstadt' },
      });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function legeSystemAn(endkundeId: string, namenSuffix: string): Promise<string> {
    const response = await request(testApp.httpServer)
      .post('/stammdaten/systeme')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ endkundeId, bezeichnung: `Testsystem ${namenSuffix}`, systemgrenze: 'Gebäude Musterhalle' });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  it('POST .../systeme/{systemId}/einflussgroessen entspricht Status/Content-Type/EinflussgroesseDetail-Schema', async () => {
    const endkundeId = await legeEndkundeAn('Alpha');
    const systemId = await legeSystemAn(endkundeId, 'Alpha');
    const validate = compileContractValidator(schemas, 'EinflussgroesseDetail');

    const response = await request(testApp.httpServer)
      .post(`/stammdaten/systeme/${systemId}/einflussgroessen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        groesseCode: 'personenanzahl',
        wertNum: 5,
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      });

    expect(response.status).toBe(201);
    expect(response.headers['content-type']).toContain('application/json');
    expect(validate(response.body)).toBe(true);
  });

  it('GET .../systeme/{systemId}/einflussgroessen entspricht einem Array von EinflussgroesseDetail', async () => {
    const endkundeId = await legeEndkundeAn('Beta');
    const systemId = await legeSystemAn(endkundeId, 'Beta');
    await request(testApp.httpServer)
      .post(`/stammdaten/systeme/${systemId}/einflussgroessen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        groesseCode: 'nutzflaeche',
        wertNum: 120,
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      })
      .expect(201);

    const validate = compileContractValidator(schemas, 'EinflussgroesseDetail');
    const response = await request(testApp.httpServer)
      .get(`/stammdaten/systeme/${systemId}/einflussgroessen`)
      .set('Authorization', `Bearer ${betriebToken}`);

    expect(response.status).toBe(200);
    const items = response.body as unknown[];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(validate(item)).toBe(true);
    }
  });

  it('PATCH .../einflussgroessen/{id} entspricht Status/Content-Type/EinflussgroesseKorrekturErgebnis-Schema', async () => {
    const endkundeId = await legeEndkundeAn('Gamma');
    const systemId = await legeSystemAn(endkundeId, 'Gamma');
    const erfasst = await request(testApp.httpServer)
      .post(`/stammdaten/systeme/${systemId}/einflussgroessen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        groesseCode: 'personenanzahl',
        wertNum: 3,
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      })
      .expect(201);
    const einflussgroesseId = (erfasst.body as { id: string }).id;

    const validate = compileContractValidator(schemas, 'EinflussgroesseKorrekturErgebnis');
    const response = await request(testApp.httpServer)
      .patch(`/stammdaten/einflussgroessen/${einflussgroesseId}`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ gueltigBisMonat: '2026-06-01' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(validate(response.body)).toBe(true);
  });

  it('GET .../endkunden/{endkundeId}/einflussgroessen/befunde entspricht einem Array von EinflussgroesseBefundItem (leer, v1)', async () => {
    const endkundeId = await legeEndkundeAn('Delta');
    const validate = compileContractValidator(schemas, 'EinflussgroesseBefundItem');

    const response = await request(testApp.httpServer)
      .get(`/stammdaten/endkunden/${endkundeId}/einflussgroessen/befunde`)
      .set('Authorization', `Bearer ${betriebToken}`);

    expect(response.status).toBe(200);
    const items = response.body as unknown[];
    expect(Array.isArray(items)).toBe(true);
    for (const item of items) {
      expect(validate(item)).toBe(true);
    }
  });

  it('400 problem+json validiert gegen das Problem-Schema (ungueltiger groesseCode/wert_art-Mismatch)', async () => {
    const endkundeId = await legeEndkundeAn('Epsilon');
    const systemId = await legeSystemAn(endkundeId, 'Epsilon');
    const validate = compileContractValidator(schemas, 'Problem');

    const response = await request(testApp.httpServer)
      .post(`/stammdaten/systeme/${systemId}/einflussgroessen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        groesseCode: 'personenanzahl',
        wertCode: 'fuenf',
        gueltigAbMonat: '2026-01-01',
        betroffenerTyp: 'endkunde',
        quelleTyp: 'betriebsteam',
        rechtsgrundlage: 'art6_1b',
      });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(validate(response.body)).toBe(true);
  });
});
