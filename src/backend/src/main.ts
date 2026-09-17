import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProblemDetailsExceptionFilter } from './common/filters/problem-details.filter';

/**
 * Bootstrap des EDMS-Backends (Walking Skeleton, ADR-0001 §10.7).
 *
 * - Globale ValidationPipe: `whitelist`/`forbidNonWhitelisted`/`transform`
 *   (.claude/rules/backend-nestjs.md, api-contracts.md).
 * - Globaler Problem+JSON-Filter (RFC 9457) statt Nest-Default-Fehlerformat.
 * - Shutdown-Hooks aktiv, damit `OnModuleDestroy` (z. B. Schließen des
 *   pg.Pool in HealthService, des TypeORM-`DataSource` in `DatabaseModule`)
 *   bei SIGINT/SIGTERM zuverlässig läuft.
 * - KEIN `app.enableCors(...)`: CORS bleibt bewusst AUS (Default-Deny).
 *   Das erfüllt bereits strukturell die ADR-0002-§12-Auflage "CORS-
 *   Konfiguration spiegelt den Origin NIE mit `Access-Control-Allow-
 *   Credentials` zurück" — ohne CORS-Freigabe gibt es keine Origin-
 *   Reflexion. Sollte das Frontend je NICHT same-origin-proxied laufen
 *   (`src/frontend/vite.config.ts`), braucht eine explizite CORS-Freigabe
 *   eine enge Origin-Allowlist OHNE Wildcard+Credentials (devops-lead/
 *   security-lead-Entscheidung, kein Teil dieses Arbeitspakets).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new ProblemDetailsExceptionFilter());
  app.enableShutdownHooks();

  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  // Bootstrap-Fehler (z. B. Port belegt, Konfigurationsfehler) landen nur im
  // lokalen Prozess-Log, nicht in einer HTTP-Antwort — kein Topologie-/PII-Leak
  // nach außen möglich, da an dieser Stelle noch kein Server lauscht.
  console.error('EDMS backend failed to start:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
