import type { Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { AppModule } from '../../app.module';
import { ProblemDetailsExceptionFilter } from '../../common/filters/problem-details.filter';
import { startTestPostgres } from '../../health/test-support/testcontainer-postgres';
import {
  ensureAppLoginRole,
  buildAppConnectionString,
} from '../../ingest-worker/test-support/app-role.test-support';
import { JWT_KEY_RESOLVER } from '../../auth/jwt/jwks-provider';
import { createTestJwtIssuer } from '../../auth/test-support/jwt-test-support';
import type { TestJwtIssuer } from '../../auth/test-support/jwt-test-support';
import type { AppRole } from '../../common/security/app-role';
import { migrateTestPostgres } from './migrate-test-postgres';

export const TEST_ISSUER_URL = 'http://localhost:8080/realms/edms';
export const TEST_CLIENT_ID = 'edms-bff';

export interface StammdatenTestApp {
  readonly app: INestApplication;
  readonly httpServer: Server;
  readonly container: StartedPostgreSqlContainer;
  /**
   * `false`, wenn der Container von aussen hereingereicht wurde — dann haelt
   * ihn der Aufrufer und `stopStammdatenTestApp()` fasst ihn nicht an.
   */
  readonly besitztContainer: boolean;
  /** Signiert ein gültiges Access-Token für die angegebenen Rollen (M1-Matrix). */
  readonly signToken: (sub: string, roles: readonly AppRole[]) => Promise<string>;
}

function setDummyEnv(): void {
  process.env['KEYCLOAK_ISSUER_URL'] = TEST_ISSUER_URL;
  process.env['OIDC_CLIENT_ID'] = TEST_CLIENT_ID;
  process.env['EDMS_BFF_CLIENT_SECRET'] ??= 'stammdaten-test-dummy-secret';
  process.env['OIDC_REDIRECT_URI'] ??= 'http://localhost:3000/auth/callback';
  // ADR-0008 §19 (F6-Bedingung 4) — Dev-KMS-Master-Key NUR aus Env, NIE
  // hartkodiert im Repo; hier ein PRO-TESTLAUF zufälliger Wert (nie derselbe
  // Wert zweimal, kein Schlüsselmaterial mit Bedeutung außerhalb des Tests).
  process.env['EDMS_DEV_KMS_MASTER_KEY'] ??= randomBytes(32).toString('base64');
  // ADR-0005 §26.3 (RL-3) — analog: Dev-Blind-Index-Pepper NUR aus Env, NIE
  // im Repo; PRO-TESTLAUF zufälliger Wert (`CryptoModule`/`LocalDevPepperAdapter`
  // wird seit dem Refactoring ebenfalls eagerly beim Bootstrap konstruiert).
  process.env['EDMS_DEV_BLIND_INDEX_PEPPER'] ??= randomBytes(32).toString('hex');
  // Klimaquelle FEST auf synthetic — nicht `??=`, sondern ueberschreibend.
  //
  // Die Integrationstests pruefen den Rechenkern, nicht den DWD-Bezugsweg
  // (der hat eigene Unit-Tests gegen eingefrorene Archive). Sie erzeugen
  // Stationskennungen wie `TEST-<uuid>`, die keine DWD-Stationsnummern sind.
  // Bliebe hier ein `EDMS_KLIMA_QUELLE=dwd` aus der Entwickler-Shell stehen —
  // und `.env` wird fuer Migrationen regelmaessig in die Shell geladen —,
  // scheiterten die Tests mit „ist keine DWD-Stationsnummer" statt mit einer
  // Aussage ueber den Code. Ausserdem gingen dann bei jedem Testlauf echte
  // Abrufe an opendata.dwd.de hinaus, was in einem Testlauf nichts zu suchen
  // hat.
  process.env['EDMS_KLIMA_QUELLE'] = 'synthetic';
  // EDMS_ENV_CLASS/EDMS_SYNTHETIC_ONLY bleiben auf ihren sicheren Defaults
  // (dev/true, ADR-0008 §22) — bewusst NICHT gesetzt.
}

/**
 * Bootet die VOLLSTÄNDIGE NestJS-App (inkl. `StammdatenModule`) gegen einen
 * echten, VOLLSTÄNDIG MIGRIERTEN (`migrations/V0001`-`V0006`) Postgres+
 * TimescaleDB-Testcontainer — KEIN DB-Mock (`.claude/rules/tests.md`).
 * Überschreibt `JWT_KEY_RESOLVER` mit einer lokalen Test-JWKS (identisches
 * Muster zu `auth-session.contract.integration.spec.ts` — kein echter
 * Keycloak nötig). Der Stammdaten-Audit-Katalog kommt jetzt aus der
 * Migration V0006 (`migrations/V0006__seed_stammdaten_event_typen.sql`) —
 * kein separater Test-Seed mehr (der frühere, grobe Test-Seed
 * `seed-stammdaten-audit-catalog.ts` wurde durch V0006 abgelöst und
 * entfernt, da er dieselben 17 Codes ein zweites Mal eingefügt hätte).
 */
export async function startStammdatenTestApp(
  optionen: { readonly container?: StartedPostgreSqlContainer } = {},
): Promise<StammdatenTestApp> {
  setDummyEnv();
  // Ein hereingereichter Container ist bereits migriert (der Aufrufer teilt
  // ihn sich mit einer anderen App — z. B. dem Ingest-Worker im
  // Ketten-Test). Erneutes Migrieren waere nicht nur unnoetig, es wuerde die
  // Pruefsummen-Kontrolle des Runners gegen einen bereits vollen Katalog
  // laufen lassen.
  const besitztContainer = optionen.container === undefined;
  const container = optionen.container ?? (await startTestPostgres());

  if (besitztContainer) {
    await migrateTestPostgres(container);
  }

  // UNTER WELCHER ROLLE DIE APP IM TEST VERBINDET
  //
  // Vorgabe ist weiterhin der Bootstrap-Superuser des Testcontainers. Mit
  // `EDMS_TEST_APP_ROLLE=1` verbindet sie stattdessen unter `edms_app` —
  // der Rolle, unter der sie im Zielbetrieb laeuft
  // (`compliance/dsgvo/toms.md`).
  //
  // WARUM DAS EINEN SCHALTER BRAUCHT UND NICHT EINFACH UMGESTELLT IST:
  // Unter dem Superuser gelingt jede Abfrage, unabhaengig davon, ob die
  // Zielrolle sie duerfte — die Tests pruefen dann, ob etwas FUNKTIONIERT,
  // nicht ob es ERLAUBT ist. Genau dadurch blieb ein echter Defekt
  // monatelang unbemerkt (die C-10-Zaehlung enumerierte `energy.zaehler`
  // direkt, worauf `edms_app` kein Recht hat).
  //
  // Der Lauf unter `edms_app` ist heute NICHT gruen, und das ist kein Mangel
  // dieses Schalters, sondern sein Ergebnis: Er faellt an genau drei Pfaden
  // aus, an denen der Code eine dokumentierte Rollentrennung nicht einhaelt
  // (`einfluss.*`, `nachweis.export_pseudonym`, Quarantaene-Retention — s.
  // Kopf von `migrations/V0092`). Keine Code-Stelle verbindet je unter
  // `edms_retention`, `edms_einfluss` oder `edms_nachweis_renderer`; die
  // Rollen existieren nur in Migrationen.
  //
  //     EDMS_TEST_APP_ROLLE=1 pnpm --filter @edms/backend test:integration
  //
  // Dieser Lauf ist die ABNAHMEBEDINGUNG fuer den Umbau auf eigene
  // Verbindungs-Pools: Sobald er gruen ist, sind die drei Kontrollen echt.
  // Dann faellt der Schalter weg und `edms_app` wird die Vorgabe.
  if (process.env['EDMS_TEST_APP_ROLLE'] === '1') {
    await ensureAppLoginRole(container);
    process.env['DATABASE_URL'] = buildAppConnectionString(container);
  } else {
    process.env['DATABASE_URL'] = container.getConnectionUri();
  }

  const issuer: TestJwtIssuer = await createTestJwtIssuer();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JWT_KEY_RESOLVER)
    .useValue(issuer.keyResolver)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ProblemDetailsExceptionFilter());
  await app.init();
  // ZWINGEND `listen()`, NICHT nur `init()` — und der Grund ist nicht Kosmetik:
  //
  // `supertest` prueft vor jedem Request `server.address()`. Ist der Server
  // NICHT gebunden, ruft es selbst `app.listen(0)` und SCHLIESST den Server in
  // seinem `end()`-Callback wieder (`supertest/lib/test.js`). Jeder Request
  // durchlief damit einen eigenen listen/close-Zyklus auf einem NEUEN Port.
  //
  // Seit Node 19 hat der globale HTTP-Agent `keepAlive: true`: Der Socket des
  // vorigen Requests bleibt im Pool, waehrend `close()` laeuft. Der naechste
  // Request greift diesen Socket zu einem sterbenden Server ab — Ergebnis:
  // „socket hang up", zufaellig verteilt, unter Last haeufiger, in Isolation
  // nie. Genau das Flakiness-Muster, das die Suite ueber Wochen gezeigt hat
  // (je Lauf hoechstens EIN Test, jedes Mal ein anderer).
  //
  // Ein einmal gebundener Server macht `supertest`s Zweig `if (!addr)` tot:
  // Es uebernimmt den Server nie und schliesst ihn folglich auch nicht. Port 0
  // = vom Betriebssystem vergeben, kein Konflikt zwischen den Spec-Dateien.
  await app.listen(0);

  const signToken = (sub: string, roles: readonly AppRole[]): Promise<string> =>
    issuer.sign({
      iss: TEST_ISSUER_URL,
      azp: TEST_CLIENT_ID,
      sub,
      actor_typ: 'benutzer',
      realm_access: { roles: [...roles] },
    });

  return { app, httpServer: app.getHttpServer() as Server, container, besitztContainer, signToken };
}

export async function stopStammdatenTestApp({ app, container, besitztContainer }: StammdatenTestApp): Promise<void> {
  await app.close().catch(() => undefined);
  if (besitztContainer) {
    await container.stop().catch(() => undefined);
  }
}
