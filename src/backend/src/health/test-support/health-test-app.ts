import type { Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { AppModule } from '../../app.module';
import { ProblemDetailsExceptionFilter } from '../../common/filters/problem-details.filter';
import { startTestPostgres } from './testcontainer-postgres';

export interface HealthTestApp {
  readonly app: INestApplication;
  /**
   * Typisierter HTTP-Server für supertest — `getHttpServer()` liefert `any`;
   * die Assertion passiert genau EINMAL hier statt in jedem Test.
   */
  readonly httpServer: Server;
  readonly container: StartedPostgreSqlContainer;
}

/**
 * Setzt die (ADR-0002 Teil B, Phase 4 AP-BCD) Pflicht-Umgebungsvariablen für
 * `AuthConfigService` — `AppModule` verdrahtet `AuthModule` jetzt global
 * (`JwtAuthGuard`/`PolicyInterceptor` als `APP_GUARD`/`APP_INTERCEPTOR`), und
 * `AuthConfigService` wirft fail-fast, wenn diese fehlen. Ein echter Keycloak
 * wird für die Health-Tests NICHT gebraucht: `/health`+`/health/ready` sind
 * `@Public()`, der `JWT_KEY_RESOLVER` (`createRemoteJWKSet`) fasst die JWKS
 * erst beim ERSTEN tatsächlichen Verifikationsversuch an (lazy) — der hier
 * nie stattfindet.
 *
 * `EDMS_DEV_KMS_MASTER_KEY` (ADR-0008 §19/§22): `AppModule` bindet seit
 * Phase 4 `StammdatenModule` global — `LocalDevKmsAdapter` wird beim
 * Bootstrap eagerly konstruiert (fail-closed Startup-Self-Check) und
 * verlangt diesen Wert, auch wenn der Health-Test keine Stammdaten-Route
 * anfasst. Seit dem `CryptoModule`-Refactoring (ADR-0005 §18/§26.3) gilt
 * dasselbe für `EDMS_DEV_BLIND_INDEX_PEPPER` (`LocalDevPepperAdapter`).
 */
function setDummyAuthEnv(): void {
  process.env['KEYCLOAK_ISSUER_URL'] ??= 'http://localhost:8080/realms/edms';
  process.env['OIDC_CLIENT_ID'] ??= 'edms-bff';
  process.env['EDMS_BFF_CLIENT_SECRET'] ??= 'health-test-dummy-secret';
  process.env['OIDC_REDIRECT_URI'] ??= 'http://localhost:3000/auth/callback';
  process.env['EDMS_DEV_KMS_MASTER_KEY'] ??= randomBytes(32).toString('base64');
  process.env['EDMS_DEV_BLIND_INDEX_PEPPER'] ??= randomBytes(32).toString('hex');
}

/**
 * Bootet die VOLLSTÄNDIGE NestJS-App (inkl. global registriertem
 * `JwtAuthGuard` + Transaction-/AuditAction-/PolicyInterceptor aus
 * `AppModule`, ADR-0002 Teil B) gegen einen echten Postgres+TimescaleDB-
 * Testcontainer — KEIN DB-Mock (.claude/rules/tests.md).
 *
 * Spiegelt bewusst exakt die globale Wiring aus `main.ts`
 * (`ValidationPipe` + `ProblemDetailsExceptionFilter`): `main.ts` registriert
 * diese NICHT in `AppModule`, sondern nur im Bootstrap-Skript selbst — ohne
 * diese Spiegelung würden Fehlerantworten in Tests NICHT als
 * `application/problem+json` geformt und die Contract-/Integrationstests
 * gegen die falsche (Nest-Default-)Fehler-Form prüfen.
 */
export async function startHealthTestApp(): Promise<HealthTestApp> {
  setDummyAuthEnv();
  const container = await startTestPostgres();
  process.env['DATABASE_URL'] = container.getConnectionUri();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsExceptionFilter());

  await app.init();
  // Einmal binden — s. die ausfuehrliche Begruendung in
  // `stammdaten/test-support/stammdaten-test-app.ts`: Ohne gebundenen Server
  // uebernimmt `supertest` ihn je Request und schliesst ihn wieder, was
  // zusammen mit dem keep-alive-Agenten seit Node 19 zufaellige
  // „socket hang up"-Fehler erzeugt.
  await app.listen(0);

  return { app, httpServer: app.getHttpServer() as Server, container };
}

/** Fährt App und Container idempotent herunter (auch wenn der Container in einem Test bereits gestoppt wurde). */
export async function stopHealthTestApp({ app, container }: HealthTestApp): Promise<void> {
  await app.close().catch(() => undefined);
  await container.stop().catch(() => undefined);
}
