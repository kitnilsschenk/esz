import { Global, Inject, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';

export const EINFLUSS_ERKENNUNG_POOL = Symbol('EINFLUSS_ERKENNUNG_POOL');

/**
 * Die zweite Verbindung des TB-03-Erkennungslaufs (Auflagen A17/A20 des
 * `compliance-director`-Votums vom 2026-09-16).
 *
 * WARUM ÜBERHAUPT EINE ZWEITE VERBINDUNG. Der Lauf liest Klartext-PII
 * (Personenanzahl, Nutzfläche) unbeaufsichtigt und in Serie. Liefe er über
 * die gewöhnliche App-Verbindung, liefe er als Eigentümer der Datenbank —
 * mit Löschrecht auf genau diese Daten. `edms_einfluss_erkennung` (V0079)
 * darf lesen und Befunde schreiben, sonst nichts; PostgreSQL erzwingt das,
 * unabhängig davon, was dieser Code tut oder künftig tut.
 *
 * WARUM NICHT `edms_einfluss`: Jene Rolle trägt seit V0022 DELETE auf
 * `einfluss.intervall` und `einfluss.befund`.
 *
 * Muster und Begründung sind vom Ingest-Worker übernommen
 * (`ingest-pg.module.ts`, ADR-0005 §26.4 RL-1) — einschließlich des
 * Schließ-Flags: `pg.Pool.end()` wirft beim zweiten Aufruf, und ein
 * überwachter Dienst wertete den geordneten Stopp dann als Absturz.
 *
 * KEIN TypeORM/`nestjs-cls`: Jene Maschinerie hängt an HTTP-Request-
 * Transaktionen; der Runner hat keinen Request. Der Schreibpfad öffnet seine
 * Transaktion explizit (`tb03-befund.repository.ts`).
 */
@Global()
@Module({
  providers: [
    {
      provide: EINFLUSS_ERKENNUNG_POOL,
      useFactory: (): Pool => createEinflussErkennungPgPool(),
    },
  ],
  exports: [EINFLUSS_ERKENNUNG_POOL],
})
export class EinflussErkennungPgModule implements OnApplicationShutdown {
  constructor(@Inject(EINFLUSS_ERKENNUNG_POOL) private readonly pool: Pool) {}

  private geschlossen = false;

  async onApplicationShutdown(): Promise<void> {
    if (this.geschlossen) {
      return;
    }
    this.geschlossen = true;
    await this.pool.end();
  }
}

// Bindet jede einzelne Anweisung des Laufs. Der Lauf ist ein Batch ohne
// Aufsicht: eine hängende Anweisung soll als Fehler enden, nicht als
// stiller Stillstand (Herleitung wie `ingest-database.config.ts` PE-6).
const ERKENNUNG_STATEMENT_TIMEOUT_MS = 60_000;
const ERKENNUNG_LOCK_TIMEOUT_MS = 5_000;
const ERKENNUNG_CONNECTION_TIMEOUT_MS = 5_000;

/**
 * Eigene Env-Variable `EDMS_EINFLUSS_ERKENNUNG_DATABASE_URL` — NICHT
 * `DATABASE_URL`. Fail-closed: Fehlt sie, startet der Lauf gar nicht. Ein
 * stiller Rückfall auf die App-Verbindung wäre genau die Aufweichung, die
 * A20 verhindern soll — und er fiele niemandem auf, weil der Lauf dann
 * einfach funktionierte.
 */
export function createEinflussErkennungPgPool(): Pool {
  const connectionString = process.env['EDMS_EINFLUSS_ERKENNUNG_DATABASE_URL'];
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error(
      'EDMS_EINFLUSS_ERKENNUNG_DATABASE_URL ist nicht gesetzt — der TB-03-Erkennungslauf braucht eine EIGENE, ' +
        'least-privilege Verbindung als DB-Rolle edms_einfluss_erkennung (V0079, Auflage A20) und verbindet ' +
        'NIEMALS ueber DATABASE_URL. Fail-closed: harter Fehlstart statt eines impliziten Fallbacks.',
    );
  }

  return new Pool({
    connectionString,
    // Ein Prozess, ein Lauf, sequenziell — der Pool braucht keine Breite.
    max: 2,
    connectionTimeoutMillis: ERKENNUNG_CONNECTION_TIMEOUT_MS,
    statement_timeout: ERKENNUNG_STATEMENT_TIMEOUT_MS,
    lock_timeout: ERKENNUNG_LOCK_TIMEOUT_MS,
  });
}
