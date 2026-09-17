import { Global, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * TypeORM-`DataSource`-Factory — AUSSCHLIESSLICH als Connection-Pool +
 * Transaktions-/`EntityManager`-Fassade für `nestjs-cls` +
 * `@nestjs-cls/transactional` (ADR-0002 Teil B §15, Konflikt-B-Savepoint-
 * Kette). KEIN Schema-Management durch TypeORM: `synchronize` und
 * `migrationsRun` sind fest `false`, `entities` bleibt leer. Die einzige
 * Quelle der Wahrheit für das Schema ist `migrations/**` (`@edms/migrate`,
 * `.claude/rules/database-migrations.md`) — rohes SQL (u. a.
 * `SELECT * FROM audit.append_event(...)`) läuft über
 * `EntityManager.query(...)`.
 */
export function createEdmsDataSource(): DataSource {
  const connectionString = process.env['DATABASE_URL'];
  if (connectionString === undefined || connectionString.length === 0) {
    throw new Error('DATABASE_URL ist nicht gesetzt — DataSource kann nicht initialisiert werden.');
  }

  return new DataSource({
    type: 'postgres',
    url: connectionString,
    synchronize: false,
    migrationsRun: false,
    entities: [],
    logging: false,
    // Kleines, request-lastiges Web-Backend: konservative Pool-Obergrenze.
    // Feintuning ist Phase-4-Betriebs-/Benchmark-Thema (ADR-0003 §14.2, M4).
    extra: { max: 10 },
  });
}

@Global()
@Module({
  providers: [
    {
      provide: DataSource,
      useFactory: async (): Promise<DataSource> => {
        const dataSource = createEdmsDataSource();
        await dataSource.initialize();
        return dataSource;
      },
    },
  ],
  exports: [DataSource],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(private readonly dataSource: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }
}
