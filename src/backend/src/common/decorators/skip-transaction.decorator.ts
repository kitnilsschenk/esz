import { SetMetadata } from '@nestjs/common';

export const SKIP_TRANSACTION_KEY = 'skipTransaction';

/**
 * Explizites, ENGES Opt-OUT vom global geöffneten `TransactionInterceptor`
 * (ADR-0002 Teil B §15) — NICHT äquivalent zu `@Public()`: die BFF-Auth-
 * Endpunkte (`/auth/login`, `/auth/callback`, `/auth/refresh`,
 * `/auth/logout`) sind ebenfalls `@Public()`, brauchen aber weiterhin die
 * ambiente Transaktion (`AuthService` ruft `AuditService.append()` dort
 * direkt auf, `backend-lead`-Votum F2) — deshalb ein EIGENER Marker statt
 * "skip bei @Public()".
 *
 * Default bleibt bewusst "Transaktion ÖFFNEN" (fail-closed Richtung: eine
 * vergessene Markierung führt höchstens zu einer unnötigen, aber
 * HARMLOSEN Transaktion — nie zu einem stillen Ausfall der Audit-/
 * Savepoint-Kette, z. B. im `AuditActionInterceptor`-M2-Fallback auf
 * nicht-`@AuditAction`-Routen). `@SkipTransaction()` ist daher NUR für
 * Routen vorgesehen, die nachweislich NIE über die ambiente,
 * CLS-getragene `TransactionHost`-Verbindung auf die DB zugreifen — aktuell
 * ausschließlich `HealthController` (eigener, separater `pg.Pool`,
 * `HealthService`), dessen Liveness-/Readiness-Antwort NICHT von einer
 * erfolgreich geöffneten Transaktion abhängen darf (sonst liefert eine tote
 * DB fälschlich 500 statt der eigenen, kontrollierten 503-Antwort).
 */
export const SkipTransaction = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_TRANSACTION_KEY, true);
