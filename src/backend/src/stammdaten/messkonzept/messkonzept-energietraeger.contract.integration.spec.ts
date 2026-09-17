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
 * Contract-Test für die beiden Routen am Messkonzept-Energieträger:
 * Systemgrenze (V0072) und Baseline-Bezugszeiträume (V0073).
 *
 * Beide entscheiden über die Richtigkeit jeder Einsparzahl — die eine, WELCHE
 * Zähler ein Lauf umfasst, die andere, woraus GTZ_base gebildet wird. Ein
 * Feld, das die Oberfläche erwartet und der Server nicht liefert (oder
 * umgekehrt), fiele hier auf und nicht erst an einer leeren Anzeige.
 *
 * `.claude/rules/tests.md`: „Jeder neue Endpoint bekommt einen Contract-Test
 * gegen OpenAPI-Spec." Die Systemgrenze ist hier NACHGEZOGEN — sie kam ohne.
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
  readonly components: { readonly schemas: Record<string, unknown> };
}

function loadContractSchemas(): Record<string, unknown> {
  return (parse(readFileSync(OPENAPI_CONTRACT_PATH, 'utf8')) as OpenApiDocument).components.schemas;
}

function compileContractValidator(schemas: Record<string, unknown>, schemaName: string): ValidateFunction {
  if (schemas[schemaName] === undefined) {
    throw new Error(`OpenAPI-Contract enthält kein Schema "${schemaName}" (schemas/openapi/stammdaten.openapi.yaml).`);
  }
  const ajv = new Ajv2020({ strict: false });
  return ajv.compile({
    $id: `edms-mvet-contract-${schemaName}-${randomUUID()}`,
    $ref: `#/components/schemas/${schemaName}`,
    components: { schemas },
  });
}

describe('Messkonzept-Energietraeger-Contract gegen schemas/openapi/stammdaten.openapi.yaml', () => {
  let testApp: StammdatenTestApp;
  let schemas: Record<string, unknown>;
  let betriebToken: string;

  beforeAll(async () => {
    schemas = loadContractSchemas();
    testApp = await startStammdatenTestApp();
    betriebToken = await testApp.signToken('betrieb-mvet-contract', ['betrieb']);
  }, 180_000);

  afterAll(async () => {
    await stopStammdatenTestApp(testApp);
  });

  function key(): string {
    return randomUUID();
  }

  /** Endkunde mit einem System und einem Messkonzept (Wärme). */
  async function bestand(): Promise<{ mvetId: string; systemId: string }> {
    const endkunde = await request(testApp.httpServer)
      .post('/stammdaten/endkunden')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ stammdatenPii: { name: `Contract ${randomUUID().slice(0, 8)}`, anschrift: 'Teststrasse 1' } });
    expect(endkunde.status).toBe(201);
    const endkundeId = (endkunde.body as { id: string }).id;

    const system = await request(testApp.httpServer)
      .post('/stammdaten/systeme')
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ endkundeId, bezeichnung: 'Halle A', systemgrenze: 'Halle A', systembeschreibung: 'Test' });
    expect(system.status).toBe(201);

    const version = await request(testApp.httpServer)
      .post(`/stammdaten/endkunden/${endkundeId}/messkonzept/versionen`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({
        typ: 'vereinfacht',
        systemgrenze: 'Test',
        systembeschreibung: 'Test',
        bereinigungsverfahren: 'Gradtagzahlverfahren',
        messgeraeteWahl: 'Test',
        geraeteerkennungsVerfahren: 'Test',
        energietraeger: [{ energietraeger: 'waerme', baselineWert: 120_000, baselineEinheit: 'kWh' }],
      });
    expect(version.status).toBe(201);

    return {
      mvetId: (version.body as { energietraeger: { mvetId: string }[] }).energietraeger[0]!.mvetId,
      systemId: (system.body as { id: string }).id,
    };
  }

  it('GET .../systeme entspricht dem Systemgrenze-Schema', async () => {
    const { mvetId } = await bestand();
    const validate = compileContractValidator(schemas, 'Systemgrenze');

    const antwort = await request(testApp.httpServer)
      .get(`/stammdaten/messkonzept-energietraeger/${mvetId}/systeme`)
      .set('Authorization', `Bearer ${betriebToken}`);

    expect(antwort.status).toBe(200);
    expect(antwort.headers['content-type']).toContain('application/json');
    expect(validate(antwort.body)).toBe(true);
  }, 120_000);

  it('PUT .../systeme entspricht dem Systemgrenze-Schema', async () => {
    const { mvetId, systemId } = await bestand();
    const validate = compileContractValidator(schemas, 'Systemgrenze');

    const antwort = await request(testApp.httpServer)
      .put(`/stammdaten/messkonzept-energietraeger/${mvetId}/systeme`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({ systemIds: [systemId] });

    expect(antwort.status).toBe(200);
    expect(validate(antwort.body)).toBe(true);
  }, 120_000);

  it('GET .../baseline-perioden entspricht dem BaselinePerioden-Schema (auch leer)', async () => {
    const { mvetId } = await bestand();
    const validate = compileContractValidator(schemas, 'BaselinePerioden');

    const antwort = await request(testApp.httpServer)
      .get(`/stammdaten/messkonzept-energietraeger/${mvetId}/baseline-perioden`)
      .set('Authorization', `Bearer ${betriebToken}`);

    expect(antwort.status).toBe(200);
    expect(antwort.headers['content-type']).toContain('application/json');
    expect(validate(antwort.body)).toBe(true);
  }, 120_000);

  it('PUT .../baseline-perioden entspricht dem BaselinePerioden-Schema — mit UND ohne Menge', async () => {
    // Die Menge ist optional; `menge`/`einheit` muessen dann als `null`
    // durchgehen (Schema `[number, 'null']`), nicht als fehlendes Feld.
    const { mvetId } = await bestand();
    const validate = compileContractValidator(schemas, 'BaselinePerioden');

    const antwort = await request(testApp.httpServer)
      .put(`/stammdaten/messkonzept-energietraeger/${mvetId}/baseline-perioden`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({
        perioden: [
          { von: '2022-01-01', bis: '2023-01-01', menge: 120_000, einheit: 'kWh' },
          { von: '2023-01-01', bis: '2024-01-01' },
        ],
      });

    expect(antwort.status).toBe(200);
    expect(validate(antwort.body)).toBe(true);
    const perioden = (antwort.body as { perioden: { menge: number | null }[] }).perioden;
    expect(perioden[1]?.menge).toBeNull();
  }, 120_000);

  it('haelt die Fehlerantwort im problem+json-Format (RFC 9457)', async () => {
    const { mvetId } = await bestand();

    const antwort = await request(testApp.httpServer)
      .put(`/stammdaten/messkonzept-energietraeger/${mvetId}/baseline-perioden`)
      .set('Authorization', `Bearer ${betriebToken}`)
      .set('Idempotency-Key', key())
      .send({
        perioden: [
          { von: '2022-01-01', bis: '2023-01-01' },
          { von: '2022-06-01', bis: '2023-06-01' },
        ],
      });

    expect(antwort.status).toBe(400);
    expect(antwort.headers['content-type']).toContain('application/problem+json');
    // Auf die Felder EINZELN statt ueber `expect.any(String)`: Das liefert
    // `any` und faellt in die Lint-Regel `no-unsafe-assignment`.
    const problem = antwort.body as { status: number; title: string; detail: string };
    expect(problem.status).toBe(400);
    expect(typeof problem.title).toBe('string');
    expect(problem.detail).toMatch(/ueberschneiden sich/);
  }, 120_000);
});
