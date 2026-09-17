import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runUp } from '@edms/migrate';
import { AppModule } from '../../app.module';
import { ProblemDetailsExceptionFilter } from '../filters/problem-details.filter';
import { startTestPostgres } from '../../health/test-support/testcontainer-postgres';
import { TestWidgetModule } from './test-support/fixture/widget.module';
import { JWT_KEY_RESOLVER } from '../../auth/jwt/jwks-provider';
import { createTestJwtIssuer } from '../../auth/test-support/jwt-test-support';
import type { TestJwtIssuer } from '../../auth/test-support/jwt-test-support';

/**
 * Konflikt-A/B-Regressionstest — laut ADR-0002 Teil B §18 ZWINGEND: "der
 * Fach-Rollback ... darf die `denied`/`error`-Audit-Zeile NICHT vernichten".
 * Bootet die REALE `AppModule`-Verdrahtung (JwtAuthGuard + Transaction-/
 * AuditAction-/PolicyInterceptor in exakt der produktiven Reihenfolge) gegen
 * einen echten Postgres+TimescaleDB-Testcontainer — KEIN Mock der
 * Interceptor-Kette selbst (nur `JWT_KEY_RESOLVER` wird auf eine lokale,
 * netzwerkfreie JWKS umgebogen, s. `auth/test-support/jwt-test-support.ts`).
 *
 * Das Test-Fixture-Modul (`test-support/fixture/**`) ist von der
 * Produktions-Build ausgeschlossen (`tsconfig.build.json`). Katalog-Einträge
 * (`test.widget.*`) und die Scratch-Tabelle `test_fixture.widget` werden
 * NUR hier, direkt gegen den Testcontainer, angelegt — kein Bezug zu
 * `migrations/**` oder zur echten `/add-audit-event`-Migration.
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

describe('Interceptor-Kette Ende-zu-Ende (ADR-0002 §15/§18, Konflikt A + B)', () => {
  let container: Awaited<ReturnType<typeof startTestPostgres>>;
  let app: INestApplication;
  let httpServer: Server;
  let verifyClient: Client;
  let betriebToken: string;
  let noAdminRoleToken: string;

  beforeAll(async () => {
    setAuthEnv();
    container = await startTestPostgres();
    process.env['DATABASE_URL'] = container.getConnectionUri();

    const migrationsDir = path.join(findRepoRoot(process.cwd()), 'migrations');
    const migrationClient = new Client({ connectionString: container.getConnectionUri() });
    await migrationClient.connect();
    await runUp(migrationClient, migrationsDir);

    // Test-only Katalog-Seed + Scratch-Tabelle (NICHT Teil der echten
    // `/add-audit-event`-Migration — s. finale Antwort dieses Arbeitspakets).
    await migrationClient.query(
      `INSERT INTO audit.event_typ (code) VALUES ('test.widget.erstellt'), ('test.widget.gelesen')
       ON CONFLICT DO NOTHING`,
    );
    await migrationClient.query(
      `INSERT INTO audit.event_typ_version
         (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys, rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
       VALUES
         (gen_random_uuid(), 'test.widget.erstellt', 'test_widget', 'erstellen', ARRAY[]::text[], false, false, true, 'Test-Fixture', now()),
         (gen_random_uuid(), 'test.widget.gelesen', 'test_widget', 'lesen', ARRAY[]::text[], false, false, true, 'Test-Fixture', now())`,
    );
    await migrationClient.query('CREATE SCHEMA IF NOT EXISTS test_fixture');
    await migrationClient.query(
      'CREATE TABLE IF NOT EXISTS test_fixture.widget (id uuid PRIMARY KEY, name text NOT NULL)',
    );
    await migrationClient.end();

    verifyClient = new Client({ connectionString: container.getConnectionUri() });
    await verifyClient.connect();

    const issuer: TestJwtIssuer = await createTestJwtIssuer();
    betriebToken = await issuer.sign({
      iss: ISSUER_URL,
      azp: CLIENT_ID,
      sub: 'betrieb-sub',
      actor_typ: 'benutzer',
      realm_access: { roles: ['betrieb'] },
    });
    noAdminRoleToken = await issuer.sign({
      iss: ISSUER_URL,
      azp: CLIENT_ID,
      sub: 'kein-admin-sub',
      actor_typ: 'benutzer',
      realm_access: { roles: ['betrieb'] },
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule, TestWidgetModule] })
      .overrideProvider(JWT_KEY_RESOLVER)
      .useValue(issuer.keyResolver)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new ProblemDetailsExceptionFilter());
    await app.init();
    httpServer = app.getHttpServer() as Server;
  }, 180_000);

  afterAll(async () => {
    await verifyClient?.end().catch(() => undefined);
    await app?.close().catch(() => undefined);
    await container?.stop().catch(() => undefined);
  });

  it('POST /test/widgets (betrieb, Erfolg): committet Fach-Insert UND eine ok-Audit-Zeile', async () => {
    const response = await request(httpServer)
      .post('/test/widgets')
      .set('Authorization', `Bearer ${betriebToken}`)
      .send({ name: 'erfolgreiches-widget' });

    expect(response.status).toBe(201);
    const widgetId = (response.body as { id: string }).id;

    const widgetRow = await verifyClient.query('SELECT name FROM test_fixture.widget WHERE id = $1', [widgetId]);
    expect(widgetRow.rowCount).toBe(1);

    const auditRow = await verifyClient.query(
      "SELECT ergebnis, actor_sub, objekt_ref FROM audit.event WHERE event_typ = 'test.widget.erstellt' AND objekt_ref = $1",
      [widgetId],
    );
    expect(auditRow.rowCount).toBe(1);
    expect(auditRow.rows[0]).toMatchObject({ ergebnis: 'ok', actor_sub: 'betrieb-sub' });
  }, 30_000);

  it(
    'POST /test/widgets (betrieb, Fach-Fehler NACH dem INSERT): Fach-Insert rollt zum SAVEPOINT zurück, ' +
      'error-Audit-Zeile überlebt (Konflikt B, ADR-0002 §18 zwingend)',
    async () => {
      const before = await verifyClient.query('SELECT count(*)::int AS count FROM test_fixture.widget');

      const response = await request(httpServer)
        .post('/test/widgets')
        .set('Authorization', `Bearer ${betriebToken}`)
        .send({ name: 'fehlschlagendes-widget', shouldFail: true });

      expect(response.status).toBe(500);
      expect(response.headers['content-type']).toContain('application/problem+json');

      const after = await verifyClient.query('SELECT count(*)::int AS count FROM test_fixture.widget');
      expect((after.rows[0] as { count: number }).count).toBe((before.rows[0] as { count: number }).count);

      const namedWidget = await verifyClient.query('SELECT 1 FROM test_fixture.widget WHERE name = $1', [
        'fehlschlagendes-widget',
      ]);
      expect(namedWidget.rowCount).toBe(0);

      const auditRows = await verifyClient.query(
        "SELECT ergebnis, actor_sub FROM audit.event WHERE event_typ = 'test.widget.erstellt' " +
          "AND ergebnis = 'error' AND actor_sub = 'betrieb-sub'",
      );
      // Der entscheidende Beweis: MINDESTENS eine error-Zeile persistiert,
      // obwohl der Fach-INSERT per Savepoint zurückgerollt wurde.
      expect(auditRows.rowCount ?? 0).toBeGreaterThanOrEqual(1);
    },
    30_000,
  );

  it('GET /test/widgets (authentisiert, ohne admin-Rolle): 403 + denied-Audit-Zeile (Konflikt A)', async () => {
    const response = await request(httpServer)
      .get('/test/widgets')
      .set('Authorization', `Bearer ${noAdminRoleToken}`);

    expect(response.status).toBe(403);
    expect(response.headers['content-type']).toContain('application/problem+json');

    const auditRows = await verifyClient.query(
      "SELECT ergebnis, actor_sub FROM audit.event WHERE event_typ = 'test.widget.gelesen' " +
        "AND ergebnis = 'denied' AND actor_sub = 'kein-admin-sub'",
    );
    expect(auditRows.rowCount ?? 0).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('GET /test/widgets (kein Token): 401, KEIN audit.event (rote Linie 1 — Security-Log statt Audit)', async () => {
    const before = await verifyClient.query(
      "SELECT count(*)::int AS count FROM audit.event WHERE event_typ = 'test.widget.gelesen'",
    );

    const response = await request(httpServer).get('/test/widgets');
    expect(response.status).toBe(401);

    const after = await verifyClient.query(
      "SELECT count(*)::int AS count FROM audit.event WHERE event_typ = 'test.widget.gelesen'",
    );
    expect((after.rows[0] as { count: number }).count).toBe((before.rows[0] as { count: number }).count);
  }, 30_000);
});
