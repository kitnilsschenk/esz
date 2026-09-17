import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import request from 'supertest';
import { parse } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';
import { startStammdatenTestApp, stopStammdatenTestApp } from '../stammdaten/test-support/stammdaten-test-app';

/**
 * Contract-Test: validiert die REALEN Responses der neuen
 * Verbrauchs-/Messwert-Routen gegen `schemas/openapi/messwerte.openapi.yaml`
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

const OPENAPI_CONTRACT_PATH = path.join(findRepoRoot(process.cwd()), 'schemas/openapi/messwerte.openapi.yaml');

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
    throw new Error(`OpenAPI-Contract enthält kein Schema "${schemaName}" (schemas/openapi/messwerte.openapi.yaml).`);
  }

  const ajv = new Ajv2020({ strict: false });
  const rootSchema = {
    $id: `edms-messwerte-contract-${schemaName}-${randomUUID()}`,
    $ref: `#/components/schemas/${schemaName}`,
    components: { schemas },
  };

  return ajv.compile(rootSchema);
}

describe('Verbrauchs-/Messwert-Contract-Validierung gegen schemas/openapi/messwerte.openapi.yaml', () => {
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
      .send({ stammdatenPii: { name: `Testkunde Messwerte-Contract ${namenSuffix}`, anschrift: 'Musterstraße 1' } });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function legeZaehlerAn(endkundeId: string, namenSuffix: string): Promise<string> {
    const systemResponse = await request(testApp.httpServer)
      .post('/stammdaten/systeme')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ endkundeId, bezeichnung: `Testsystem ${namenSuffix}`, systemgrenze: 'Gebäude' });
    const zaehlerResponse = await request(testApp.httpServer)
      .post('/stammdaten/zaehler')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ systemId: (systemResponse.body as { id: string }).id, geraetetyp: 'Testzaehler', energietraeger: 'strom' });
    expect(zaehlerResponse.status).toBe(201);
    return (zaehlerResponse.body as { id: string }).id;
  }

  it('GET .../standorte/{id}/verbrauch entspricht VerbrauchAggregatAntwort', async () => {
    const endkundeId = await legeEndkundeAn('Alpha');
    const standort = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ typ: 'liegenschaft', bezeichnung: 'Werk Contract', adresse: 'Weg 1' });
    expect(standort.status).toBe(201);

    const validate = compileContractValidator(schemas, 'VerbrauchAggregatAntwort');
    const response = await request(testApp.httpServer)
      .get(`/messwerte/standorte/${(standort.body as { id: string }).id}/verbrauch`)
      .query({ von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z', aufloesung: 'tag' })
      .set('Authorization', `Bearer ${betriebToken}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(validate(response.body)).toBe(true);
  });

  it('GET .../messkanaele/{id} entspricht MesswertZeitreiheAntwort (break-glass-Zweck gesetzt)', async () => {
    const endkundeId = await legeEndkundeAn('Beta');
    const zaehlerId = await legeZaehlerAn(endkundeId, 'Beta');
    const messkanal = await request(testApp.httpServer)
      .post(`/stammdaten/zaehler/${zaehlerId}/messkanaele`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
    expect(messkanal.status).toBe(201);
    const messkanalId = (messkanal.body as { id: string }).id;

    const validate = compileContractValidator(schemas, 'MesswertZeitreiheAntwort');
    const response = await request(testApp.httpServer)
      .get(`/messwerte/messkanaele/${messkanalId}`)
      .query({ von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z' })
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('X-Edms-Zugriffszweck', 'stoerungsdiagnose')
      .set('X-Edms-Zugriffszweck-Zaehler-Id', zaehlerId)
      .set('X-Edms-Zugriffszweck-Von', '2026-03-01T00:00:00.000Z')
      .set('X-Edms-Zugriffszweck-Bis', '2026-03-02T00:00:00.000Z');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(validate(response.body)).toBe(true);
  });

  it('GET .../messkanaele/{id} OHNE Zweck-Header entspricht dem Problem-Schema (RFC 9457, 403)', async () => {
    const validate = compileContractValidator(schemas, 'Problem');

    const response = await request(testApp.httpServer)
      .get(`/messwerte/messkanaele/${randomUUID()}`)
      .query({ von: '2026-03-01T00:00:00.000Z', bis: '2026-03-02T00:00:00.000Z' })
      .set('Authorization', `Bearer ${betriebToken}`);

    expect(response.status).toBe(403);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(validate(response.body)).toBe(true);
  });

  it('GET .../standorte/{id}/verbrauch mit ungültigem Fenster (von >= bis) entspricht dem Problem-Schema (400)', async () => {
    const endkundeId = await legeEndkundeAn('Gamma');
    const standort = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/standorte`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', idempotencyKey())
      .send({ typ: 'liegenschaft', bezeichnung: 'Werk Contract Ungueltig', adresse: 'Weg 2' });
    expect(standort.status).toBe(201);

    const validate = compileContractValidator(schemas, 'Problem');
    const response = await request(testApp.httpServer)
      .get(`/messwerte/standorte/${(standort.body as { id: string }).id}/verbrauch`)
      .query({ von: '2026-03-02T00:00:00.000Z', bis: '2026-03-01T00:00:00.000Z', aufloesung: 'tag' })
      .set('Authorization', `Bearer ${betriebToken}`);

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(validate(response.body)).toBe(true);
  });
});
