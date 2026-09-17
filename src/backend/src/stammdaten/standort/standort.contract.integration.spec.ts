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
 * Contract-Test: validiert die REALEN Responses der neuen Standort-Routen
 * (ADR-0010) gegen `schemas/openapi/stammdaten.openapi.yaml` (Muster
 * `geraet-zuordnung.contract.integration.spec.ts`, `.claude/rules/tests.md`
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

describe('Standort-Contract-Validierung gegen schemas/openapi/stammdaten.openapi.yaml (ADR-0010)', () => {
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
        stammdatenPii: { name: `Testkunde Standort-Contract ${namenSuffix}`, anschrift: 'Musterstraße 1, 12345 Musterstadt' },
      });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  it('POST .../standorte entspricht Status/Content-Type/StandortStruktur-Schema', async () => {
    const endkundeId = await legeEndkundeAn('Alpha');
    const validate = compileContractValidator(schemas, 'StandortStruktur');

    const response = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ typ: 'liegenschaft', bezeichnung: 'Werk Nord', adresse: 'Industriestrasse 1' });

    expect(response.status).toBe(201);
    expect(response.headers['content-type']).toContain('application/json');
    expect(validate(response.body)).toBe(true);
  });

  it('GET .../standorte entspricht einem Array von StandortStruktur', async () => {
    const endkundeId = await legeEndkundeAn('Beta');
    await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ typ: 'liegenschaft', bezeichnung: 'Werk Sued', adresse: 'Industriestrasse 2' })
      .expect(201);

    const validate = compileContractValidator(schemas, 'StandortStruktur');
    const response = await request(testApp.httpServer)
      .get(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`);

    expect(response.status).toBe(200);
    const items = response.body as unknown[];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(validate(item)).toBe(true);
    }
  });

  it('POST .../standorte/labels entspricht einem Array von StandortLabelItem', async () => {
    const endkundeId = await legeEndkundeAn('Gamma');
    const anlegen = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ typ: 'liegenschaft', bezeichnung: 'Werk Ost', adresse: 'Industriestrasse 3' });
    expect(anlegen.status).toBe(201);
    const standortId = (anlegen.body as { id: string }).id;

    const validate = compileContractValidator(schemas, 'StandortLabelItem');
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte/labels`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .send({ standortIds: [standortId] });

    expect(response.status).toBe(200);
    const items = response.body as unknown[];
    expect(items).toHaveLength(1);
    expect(validate(items[0])).toBe(true);
  });

  it('POST .../verschieben entspricht StandortVerschobenErgebnis', async () => {
    const endkundeId = await legeEndkundeAn('Delta');
    const wurzelA = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ typ: 'liegenschaft', bezeichnung: 'A', adresse: 'Weg A' });
    const wurzelB = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ typ: 'liegenschaft', bezeichnung: 'B', adresse: 'Weg B' });
    const kind = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ typ: 'gebaeude', parentId: (wurzelA.body as { id: string }).id, bezeichnung: 'Kind' });

    const validate = compileContractValidator(schemas, 'StandortVerschobenErgebnis');
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/standorte/${(kind.body as { id: string }).id}/verschieben`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ neuerParentId: (wurzelB.body as { id: string }).id });

    expect(response.status).toBe(200);
    expect(validate(response.body)).toBe(true);
  });

  it('POST .../zaehler/{id}/verortung entspricht ZaehlerStandortDetail', async () => {
    const endkundeId = await legeEndkundeAn('Epsilon');
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
    const standortResponse = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ typ: 'liegenschaft', bezeichnung: 'Standort', adresse: 'Weg 1' });

    const validate = compileContractValidator(schemas, 'ZaehlerStandortDetail');
    const response = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${(zaehlerResponse.body as { id: string }).id}/verortung`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ standortId: (standortResponse.body as { id: string }).id, gueltigVon: '2026-01-01T00:00:00.000Z' });

    expect(response.status).toBe(201);
    expect(validate(response.body)).toBe(true);
  });

  it('GET .../zaehler/{id}/verortung entspricht ZaehlerStandortAktuellDetail (verortet=true UND Empty-State verortet=false)', async () => {
    const endkundeId = await legeEndkundeAn('Eta');
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

    const validate = compileContractValidator(schemas, 'ZaehlerStandortAktuellDetail');

    const leer = await request(testApp.httpServer)
      .get(`/stammdaten/zaehler/${zaehlerId}/verortung`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(leer.status).toBe(200);
    expect(validate(leer.body)).toBe(true);

    const standortResponse = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ typ: 'liegenschaft', bezeichnung: 'Standort', adresse: 'Weg 1' });
    await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/verortung`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ standortId: (standortResponse.body as { id: string }).id, gueltigVon: '2026-01-01T00:00:00.000Z' })
      .expect(201);

    const verortet = await request(testApp.httpServer)
      .get(`/stammdaten/zaehler/${zaehlerId}/verortung`)
      .set('Authorization', `Bearer ${betriebToken}`);
    expect(verortet.status).toBe(200);
    expect(validate(verortet.body)).toBe(true);
  });

  it('POST .../standorte mit ungueltigem Body entspricht dem Problem-Schema (RFC 9457)', async () => {
    const endkundeId = await legeEndkundeAn('Zeta');
    const validate = compileContractValidator(schemas, 'Problem');

    const response = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ typ: 'raum', bezeichnung: 'Ungueltiger Wurzelknoten' });

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(validate(response.body)).toBe(true);
  });
});
