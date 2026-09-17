import { Pool } from 'pg';

/**
 * PE-6 (Phase-5-Performance-Review) — explizite Zeitlimits fuer den EIGENEN,
 * least-privilege Worker-Pool. Ohne diese drei Limits blockiert EINE
 * haengende Anweisung (Netzwerk-Partition, Lock-Kontention, ein extern
 * blockierter Cluster) den GESAMTEN Worker UNBEGRENZT: die Verarbeitung ist
 * strikt sequenziell (§15), es gibt keinen zweiten Connection-Slot, der
 * uebernimmt, und "Ack nach Commit" (§15/§20 Schritt 12) bedeutet konkret:
 * kein Timeout => kein Ack => kein Fortschritt, aber AUCH KEIN Fehler/Crash,
 * der einen Operator alarmieren wuerde — ein stiller Stillstand statt eines
 * lauten Fehlers. Alle drei Werte sind bewusst GROSSZUEGIG (kein aggressives
 * Tuning): die Ingest-Queries dieses Workers sind ausnahmslos kleine,
 * indexierte Punkt-Lookups/-Upserts (kein Reporting/Analytics-Workload,
 * s. `messwert-schreibpfad.repository.ts`/`device-forward-lookup.repository.ts`/
 * `energy-stammdaten-lookup.repository.ts`) — die Limits sollen einen
 * GENUINE haengenden Fall bounden, nicht normale Lastspitzen abwuergen.
 */
// Aufbau EINER NEUEN physischen Verbindung (TCP + Auth) — ein Wert deutlich
// darueber deutet auf ein Netzwerk-/DB-Erreichbarkeitsproblem hin, nicht auf
// einen normalen Betriebsfall (`pg`-Config-Key `connectionTimeoutMillis`).
const INGEST_POOL_CONNECTION_TIMEOUT_MS = 5_000;
// Bindet JEDE einzelne SQL-Anweisung auf dieser Verbindung (Postgres-
// Session-Parameter `statement_timeout`, von `pg` beim Verbindungsaufbau als
// Startup-Option gesetzt) — 10s ist grosszuegig fuer die o. g. Punkt-Abfragen,
// bindet aber eine tatsaechlich haengende Anweisung auf einen endlichen Wert.
const INGEST_POOL_STATEMENT_TIMEOUT_MS = 10_000;
// EIGENES, KUERZERES Limit NUR fuer die Lock-Wartezeit (Postgres-
// Session-Parameter `lock_timeout`, analog per Startup-Option gesetzt):
// Lock-Kontention (z. B. eine parallele Administrations-Transaktion auf
// `measurement.messwert`/`ingest.kanal_status`) soll SCHNELL fehlschlagen —
// das at-least-once-Redelivery-Modell (§15, M3, "kein Ack" bei einem
// geworfenen Fehler) uebernimmt den Retry ueber einen neuen Versuch, statt
// dass der Worker die volle `statement_timeout`-Frist auf einen Lock wartet.
const INGEST_POOL_LOCK_TIMEOUT_MS = 5_000;

/**
 * ADR-0005 §26.4 (RL-1, Least-Privilege) — der Ingest-Worker verbindet
 * NIEMALS über die breite `edms_app`-Verbindung (`DATABASE_URL`, s.
 * `common/persistence/database.module.ts`), sondern über eine EIGENE,
 * spaltenscharf berechtigte Verbindung als DB-Rolle `edms_ingest_worker`
 * (V0010/V0011/V0013 — `NOLOGIN`-Gruppenrolle, Login/Credential-Zuweisung
 * ist Betriebs-/Test-Scope, s. `test-support/ingest-worker-role.test-support.ts`
 * + Aufgabe-F-Deployment-Entwurf im Auslieferungsbericht).
 *
 * Eigene Env-Variable `EDMS_INGEST_DATABASE_URL` (NICHT `DATABASE_URL`) —
 * verhindert, dass der Worker versehentlich über dieselbe (viel breiter
 * berechtigte) Verbindung wie die API laeuft, selbst wenn beide Prozesse
 * aus demselben Image/Container-Image gestartet werden (ADR-0005 §18, F6).
 *
 * KEIN TypeORM/`nestjs-cls`-`DataSource` (das API-seitige
 * `PersistenceModule`-Muster ist an HTTP-Request-Transaktionen/Savepoint-
 * Ketten gebunden, ADR-0002 Teil B §15 — der Worker hat keinen HTTP-Request
 * und braucht diese Maschinerie nicht): ein schlichter `pg.Pool`, Schreibpfad
 * nutzt bei Bedarf eine explizite `BEGIN`/`COMMIT`-Transaktion über einen
 * ausgecheckten `PoolClient` (s. `messwert-schreibpfad.repository.ts`).
 */
export function createIngestPgPool(): Pool {
  const connectionString = process.env['EDMS_INGEST_DATABASE_URL'];
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error(
      'EDMS_INGEST_DATABASE_URL ist nicht gesetzt — der Ingest-Worker braucht eine EIGENE, least-privilege ' +
        'Verbindung als DB-Rolle edms_ingest_worker (ADR-0005 §26.4, RL-1) und verbindet NIEMALS über ' +
        'DATABASE_URL/edms_app. Fail-closed: harter Fehlstart statt eines impliziten Fallbacks.',
    );
  }

  return new Pool({
    connectionString,
    // Ein Worker-Prozess, sequenzielle Uplink-Verarbeitung (ADR-0005 §15,
    // "v1-Vorschlag: sequenziell, ein Uplink nach dem anderen") — kleine
    // Pool-Obergrenze genuegt; Feintuning ist Phase-4-Betriebs-/
    // Benchmark-Thema (analog `DatabaseModule`-Kommentar).
    max: 5,
    // PE-6 — s. Begruendung/Werte-Herleitung im Datei-Kopf.
    connectionTimeoutMillis: INGEST_POOL_CONNECTION_TIMEOUT_MS,
    statement_timeout: INGEST_POOL_STATEMENT_TIMEOUT_MS,
    lock_timeout: INGEST_POOL_LOCK_TIMEOUT_MS,
  });
}
