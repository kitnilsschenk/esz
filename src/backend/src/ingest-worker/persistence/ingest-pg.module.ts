import { Global, Inject, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { createIngestPgPool } from './ingest-database.config';

export const INGEST_PG_POOL = Symbol('INGEST_PG_POOL');

/**
 * ADR-0005 §26.4 (RL-1) — stellt den EINEN, least-privilege `pg.Pool` des
 * Workers global bereit (analog `DatabaseModule` fuer die API, aber eine
 * KOMPLETT SEPARATE Verbindung/Rolle, s. `ingest-database.config.ts`).
 */
@Global()
@Module({
  providers: [
    {
      provide: INGEST_PG_POOL,
      useFactory: (): Pool => createIngestPgPool(),
    },
  ],
  exports: [INGEST_PG_POOL],
})
export class IngestPgModule implements OnApplicationShutdown {
  constructor(@Inject(INGEST_PG_POOL) private readonly pool: Pool) {}

  /**
   * Wird nur EINMAL wirksam, auch wenn Nest den Hook mehrfach ausloest.
   *
   * `pg.Pool.end()` wirft beim zweiten Aufruf („Called end on pool more than
   * once") — und das reichte, um einen geordneten Shutdown mit Exit-Code 1
   * enden zu lassen. Aufgefallen beim Betrieb als Container (ADR-0011 C3):
   * Als handgestarteter Prozess war es folgenlos, als ueberwachter Dienst
   * waere jeder normale Stopp als Absturz gewertet worden — und ein echter
   * Fehlschlag haette sich davon nicht mehr unterschieden.
   *
   * Die URSACHE lag woanders (ein doppelter Shutdown-Pfad in
   * `worker-main.ts`, dort behoben). Dieses Flag ist die zweite Linie: Es
   * macht den Fehler auch dann harmlos, wenn jemand den Pfad kuenftig erneut
   * verdoppelt — bei einer Abbruchmechanik ist genau das die Stelle, an der
   * man nicht auf Disziplin bauen sollte.
   */
  private geschlossen = false;

  async onApplicationShutdown(): Promise<void> {
    if (this.geschlossen) {
      return;
    }
    this.geschlossen = true;
    await this.pool.end();
  }
}
