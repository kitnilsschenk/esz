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
 * Contract-Test: validiert die REALEN Responses der neuen Geraete-Zuordnungs-
 * Routen (ADR-0005 §26) gegen `schemas/openapi/stammdaten.openapi.yaml`
 * (Muster `health.contract.integration.spec.ts`, `.claude/rules/tests.md`
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

/** S. `health.contract.integration.spec.ts`-Kommentar zu `strict:false`/Wrapper-Muster. */
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

describe('Geraet-Zuordnung-Contract-Validierung gegen schemas/openapi/stammdaten.openapi.yaml (ADR-0005 §26)', () => {
  let testApp: StammdatenTestApp;
  let schemas: Record<string, unknown>;
  let betriebToken: string;
  let auditorToken: string;

  beforeAll(async () => {
    schemas = loadContractSchemas();
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-sub', ['betrieb']);
    auditorToken = await testApp.signToken('auditor-sub', ['compliance-auditor']);
  }, 120_000);

  afterAll(async () => {
    await stopStammdatenTestApp(testApp);
  });

  function idempotencyKey(): string {
    return randomUUID();
  }

  function testDevEui(): string {
    return randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  }

  async function legeZaehlerAn(namenSuffix: string): Promise<{ zaehlerId: string }> {
    const endkundeResponse = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({
        stammdatenPii: { name: `Testkunde Contract ${namenSuffix}`, anschrift: 'Musterstraße 1, 12345 Musterstadt' },
      });
    expect(endkundeResponse.status).toBe(201);
    const endkundeId = (endkundeResponse.body as { id: string }).id;

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

    return { zaehlerId: (zaehlerResponse.body as { id: string }).id };
  }

  it('POST .../geraet-zuordnungen entspricht Status/Content-Type/GeraetZuordnungDetail-Schema', async () => {
    const { zaehlerId } = await legeZaehlerAn('Alpha');
    const validate = compileContractValidator(schemas, 'GeraetZuordnungDetail');

    const response = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ devEui: testDevEui() });

    expect(response.status).toBe(201);
    expect(response.headers['content-type']).toContain('application/json');
    expect(validate(response.body)).toBe(true);
  });

  it('PATCH .../geraet-zuordnungen/{id} entspricht Status/Content-Type/GeraetZuordnungDetail-Schema', async () => {
    const { zaehlerId } = await legeZaehlerAn('Beta');
    const anlegen = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ devEui: testDevEui() });
    expect(anlegen.status).toBe(201);
    const zuordnungId = (anlegen.body as { id: string }).id;

    const validate = compileContractValidator(schemas, 'GeraetZuordnungDetail');
    const response = await request(testApp.httpServer)
      .patch(`/stammdaten/geraet-zuordnungen/${zuordnungId}`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ aktion: 'deaktivieren' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(validate(response.body)).toBe(true);
  });

  it('POST mit ungueltigem devEui entspricht dem Problem-Schema (RFC 9457)', async () => {
    const { zaehlerId } = await legeZaehlerAn('Gamma');
    const validate = compileContractValidator(schemas, 'Problem');

    const response = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ devEui: 'ungueltig' });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(validate(response.body)).toBe(true);
  });

  it('POST durch compliance-auditor (403) entspricht dem Problem-Schema (RFC 9457)', async () => {
    const { zaehlerId } = await legeZaehlerAn('Delta');
    const validate = compileContractValidator(schemas, 'Problem');

    const response = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/geraet-zuordnungen`)
      .set('Authorization', `Bearer ${auditorToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ devEui: testDevEui() });

    expect(response.status).toBe(403);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(validate(response.body)).toBe(true);
  });
});
