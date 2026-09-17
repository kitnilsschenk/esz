import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { DataSource } from 'typeorm';
import { DatabaseModule } from './database.module';

/**
 * Verdrahtet `nestjs-cls` (AsyncLocalStorage-Request-Kontext) mit
 * `@nestjs-cls/transactional` + TypeORM-Adapter (ADR-0002 Teil B §15,
 * Konflikt B — "Savepoint-Kette via `nestjs-cls` + `@nestjs-cls/
 * transactional`, `Propagation.NESTED`"). Stellt global
 * `TransactionHost<TransactionalAdapterTypeOrm>` sowie den
 * `@Transactional()`-Methoden-Decorator bereit:
 *
 * - `TransactionInterceptor` (APP_INTERCEPTOR, äußerste Ebene) öffnet die
 *   Request-Transaktion mit `Propagation.Required`.
 * - Künftige Fach-Service-Methoden (state-ändernde Business-Logik)
 *   deklarieren sich selbst mit `@Transactional(Propagation.Nested)` — das
 *   erzeugt den `SAVEPOINT`, dessen Rollback die äußere (Audit-tragende)
 *   Transaktion überlebt.
 */
@Module({
  imports: [
    DatabaseModule,
    ClsModule.forRoot({
      global: true,
      plugins: [
        new ClsPluginTransactional({
          imports: [DatabaseModule],
          adapter: new TransactionalAdapterTypeOrm({
            dataSourceToken: DataSource,
          }),
        }),
      ],
    }),
  ],
  exports: [ClsModule],
})
export class PersistenceModule {}
