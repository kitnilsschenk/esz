import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import request from 'supertest';
import { parse } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HealthTestApp } from './test-support/health-test-app';
import { startHealthTestApp, stopHealthTestApp } from './test-support/health-test-app';

/**
 * Contract-Test: validiert die REALEN Responses (Status, Content-Type,
 * Body-Struktur) gegen `schemas/openapi/health.openapi.yaml` (ADR-0001 §10.7,
 * Health-Test-Checkliste). Schema-Validierung via `ajv` (MIT); YAML-Parsing
 * via das `yaml`-Paket (ISC) — bewusst keine zusätzliche
 * OpenAPI-Validierungs-Bibliothek.
 *
 * Läuft — wie health.integration.spec.ts — gegen einen echten
 * Postgres+TimescaleDB-Testcontainer (KEIN DB-Mock, .claude/rules/tests.md).
 */

/**
 * Repo-Root über die pnpm-Workspace-Marker-Datei finden — bewusst weder
 * `import.meta` (im CJS-Typecheck verboten, TS1470) noch `__dirname`
 * (in Vitest-ESM undefiniert): funktioniert unabhängig davon, ob Vitest
 * vom Paket- oder Repo-Root aus gestartet wird.
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

const OPENAPI_CONTRACT_PATH = path.join(
  findRepoRoot(process.cwd()),
  'schemas/openapi/health.openapi.yaml',
);

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

/**
 * Baut pro Zielschema einen eigenständigen Ajv-Validator. Der Wurzel-Schema-
 * Wrapper (`$ref` + eingebettetes `components.schemas`) erlaubt es, die im
 * OpenAPI-Dokument verwendeten `#/components/schemas/...`-Fragment-Refs
 * (z. B. `ReadinessStatus` → `DependencyCheck`) unverändert aufzulösen, ohne
 * die Refs manuell umzuschreiben.
 *
 * `strict: false`, weil OpenAPI-3.1-Schemas Draft-2020-12-Vokabular
 * (`format`, `examples`) nutzen, das Ajvs Strict-Mode ohne das zusätzliche
 * `ajv-formats`-Paket sonst als unbekanntes Schlüsselwort ablehnen würde —
 * hier genügt die Struktur-/Typ-Validierung (keine schwergewichtige
 * Zusatzlib, wie im Arbeitsauftrag gefordert).
 */
function compileContractValidator(schemas: Record<string, unknown>, schemaName: string): ValidateFunction {
  if (schemas[schemaName] === undefined) {
    throw new Error(`OpenAPI-Contract enthält kein Schema "${schemaName}" (schemas/openapi/health.openapi.yaml).`);
  }

  const ajv = new Ajv2020({ strict: false });
  const rootSchema = {
    $id: `edms-health-contract-${schemaName}`,
    $ref: `#/components/schemas/${schemaName}`,
    components: { schemas },
  };

  return ajv.compile(rootSchema);
}

describe('Health-Contract-Validierung gegen schemas/openapi/health.openapi.yaml (ADR-0001 §10.7)', () => {
  let testApp: HealthTestApp;
  let schemas: Record<string, unknown>;

  beforeAll(async () => {
    schemas = loadContractSchemas();
    testApp = await startHealthTestApp();
  }, 120_000);

  afterAll(async () => {
    await stopHealthTestApp(testApp);
  });

  it('GET /health entspricht Status, Content-Type und Body-Struktur des LivenessStatus-Schemas', async () => {
    const response = await request(testApp.httpServer).get('/health');
    const validate = compileContractValidator(schemas, 'LivenessStatus');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(validate(response.body)).toBe(true);
  });

  it('GET /health/ready entspricht dem ReadinessStatus-Schema, wenn die Datenbank bereit ist', async () => {
    const response = await request(testApp.httpServer).get('/health/ready');
    const validate = compileContractValidator(schemas, 'ReadinessStatus');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(validate(response.body)).toBe(true);
  });

  it('GET /health/ready entspricht dem Problem-Schema (RFC 9457), wenn die Datenbank down ist', async () => {
    await testApp.container.stop();

    const response = await request(testApp.httpServer).get('/health/ready');
    const validate = compileContractValidator(schemas, 'Problem');

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(validate(response.body)).toBe(true);
  }, 20_000);
});
