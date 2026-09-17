import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { parse } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { ProblemDetailsExceptionFilter } from '../common/filters/problem-details.filter';
import { startTestPostgres } from '../health/test-support/testcontainer-postgres';
import { JWT_KEY_RESOLVER } from './jwt/jwks-provider';
import { createTestJwtIssuer } from './test-support/jwt-test-support';
import type { TestJwtIssuer } from './test-support/jwt-test-support';

/**
 * Contract-/M1-Test: validiert `GET /auth/session` gegen
 * `schemas/openapi/auth.openapi.yaml` (analog `health.contract.integration
 * .spec.ts`) und belegt M1 ("jede nicht-@Public-Route ohne/mit ungültigem
 * Token liefert 401") für diese konkrete Route. Bootet die REALE `AppModule`
 * -Verdrahtung; `/auth/session` selbst führt KEIN SQL aus — der
 * Testcontainer wird trotzdem gebraucht, weil der globale
 * `TransactionInterceptor` für JEDEN Request eine echte DB-Transaktion
 * öffnet (keine Migrationen nötig, nur eine erreichbare DB).
 */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('Repo-Root nicht gefunden (pnpm-workspace.yaml fehlt im Pfadbaum).');
    }
    dir = parent;
  }
}

const OPENAPI_CONTRACT_PATH = path.join(findRepoRoot(process.cwd()), 'schemas/openapi/auth.openapi.yaml');

interface OpenApiDocument {
  readonly components: { readonly schemas: Record<string, unknown> };
}

function loadContractSchemas(): Record<string, unknown> {
  const raw = readFileSync(OPENAPI_CONTRACT_PATH, 'utf8');
  return (parse(raw) as OpenApiDocument).components.schemas;
}

function compileContractValidator(schemas: Record<string, unknown>, schemaName: string): ValidateFunction {
  if (schemas[schemaName] === undefined) {
    throw new Error(`OpenAPI-Contract enthält kein Schema "${schemaName}" (schemas/openapi/auth.openapi.yaml).`);
  }

  const ajv = new Ajv2020({ strict: false });
  return ajv.compile({
    $id: `edms-auth-contract-${schemaName}`,
    $ref: `#/components/schemas/${schemaName}`,
    components: { schemas },
  });
}

const ISSUER_URL = 'http://localhost:8080/realms/edms';
const CLIENT_ID = 'edms-bff';

function setAuthEnv(): void {
  process.env['KEYCLOAK_ISSUER_URL'] = ISSUER_URL;
  process.env['OIDC_CLIENT_ID'] = CLIENT_ID;
  process.env['EDMS_BFF_CLIENT_SECRET'] = 'integration-test-secret';
  process.env['OIDC_REDIRECT_URI'] = 'http://localhost:3000/auth/callback';
  // ADR-0008 §19/§22: AppModule bindet seit Phase 4 StammdatenModule global —
  // LocalDevKmsAdapter wird beim Bootstrap eagerly konstruiert (fail-closed).
  process.env['EDMS_DEV_KMS_MASTER_KEY'] ??= randomBytes(32).toString('base64');
  // ADR-0005 §26.3: dasselbe gilt seit dem CryptoModule-Refactoring für
  // LocalDevPepperAdapter/EDMS_DEV_BLIND_INDEX_PEPPER.
  process.env['EDMS_DEV_BLIND_INDEX_PEPPER'] ??= randomBytes(32).toString('hex');
}

describe('Auth-Contract-Validierung — GET /auth/session (schemas/openapi/auth.openapi.yaml, M1)', () => {
  let container: Awaited<ReturnType<typeof startTestPostgres>>;
  let app: INestApplication;
  let httpServer: Server;
  let schemas: Record<string, unknown>;
  let validToken: string;

  beforeAll(async () => {
    setAuthEnv();
    schemas = loadContractSchemas();
    container = await startTestPostgres();
    process.env['DATABASE_URL'] = container.getConnectionUri();

    const issuer: TestJwtIssuer = await createTestJwtIssuer();
    validToken = await issuer.sign({
      iss: ISSUER_URL,
      azp: CLIENT_ID,
      sub: 'sub-contract',
      actor_typ: 'benutzer',
      realm_access: { roles: ['betrieb'] },
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JWT_KEY_RESOLVER)
      .useValue(issuer.keyResolver)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsExceptionFilter());
    await app.init();
    httpServer = app.getHttpServer() as Server;
  }, 120_000);

  afterAll(async () => {
    await app?.close().catch(() => undefined);
    await container?.stop().catch(() => undefined);
  });

  it('liefert 401 (Problem-Schema) ohne Authorization-Header (M1: deny-by-default)', async () => {
    const response = await request(httpServer).get('/auth/session');
    const validate = compileContractValidator(schemas, 'Problem');

    expect(response.status).toBe(401);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(validate(response.body)).toBe(true);
  });

  it('liefert 401, wenn das Token mit einem FREMDEN Schlüssel signiert wurde (Signatur-Prüfung greift, M1)', async () => {
    const foreignIssuer = await createTestJwtIssuer();
    const foreignToken = await foreignIssuer.sign({
      iss: ISSUER_URL,
      azp: CLIENT_ID,
      sub: 'sub-fremd',
      actor_typ: 'benutzer',
    });

    const response = await request(httpServer).get('/auth/session').set('Authorization', `Bearer ${foreignToken}`);
    expect(response.status).toBe(401);
  });

  it('liefert 401, wenn actor_typ fehlt (fail-closed, security-lead-Votum 2)', async () => {
    const issuer = await createTestJwtIssuer();
    const tokenOhneActorTyp = await issuer.sign({ iss: ISSUER_URL, azp: CLIENT_ID, sub: 'sub-x' });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JWT_KEY_RESOLVER)
      .useValue(issuer.keyResolver)
      .compile();
    const isolatedApp = moduleRef.createNestApplication();
    await isolatedApp.init();

    const response = await request(isolatedApp.getHttpServer() as Server)
      .get('/auth/session')
      .set('Authorization', `Bearer ${tokenOhneActorTyp}`);

    expect(response.status).toBe(401);
    await isolatedApp.close();
  });

  it('entspricht dem SessionInfo-Schema bei gültigem Token', async () => {
    const response = await request(httpServer).get('/auth/session').set('Authorization', `Bearer ${validToken}`);
    const validate = compileContractValidator(schemas, 'SessionInfo');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(validate(response.body)).toBe(true);
    expect(response.body).toMatchObject({ sub: 'sub-contract', actorTyp: 'benutzer', roles: ['betrieb'] });
  });
});
