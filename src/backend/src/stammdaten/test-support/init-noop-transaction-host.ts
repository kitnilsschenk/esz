import { NoOpTransactionalAdapter, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';

/**
 * Test-Support (NICHT Teil der Produktions-Build, `test-support/**` ist per
 * `tsconfig.build.json` ausgeschlossen). Initialisiert den
 * `TransactionHost`-Singleton (`@nestjs-cls/transactional`) MIT dem
 * offiziellen `NoOpTransactionalAdapter` — nötig, damit
 * `@Transactional(...)`-dekorierte Service-Methoden (z. B.
 * `EndkundeService.anlegenInTx`) in einem REINEN Unit-Test (Repos gemockt,
 * KEIN echter Nest-/CLS-Bootstrap, KEINE echte DB) aufgerufen werden können,
 * ohne mit "TransactionHost not initialized" zu scheitern.
 *
 * Der No-Op-Adapter startet KEINE echte Transaktion (reiner Pass-Through,
 * `fn()` wird direkt ausgeführt) — für Unit-Tests korrekt, weil die
 * injizierten Repositories ohnehin vollständig gemockt sind (sie rufen
 * `txHost.tx` in diesen Tests nie tatsächlich auf). Für ECHTE
 * Transaktions-/Rollback-Semantik siehe die Integrationstests
 * (Testcontainer-PG, `*.integration.spec.ts`).
 */
export function ensureNoOpTransactionHost(): void {
  const adapter = new NoOpTransactionalAdapter({ tx: {}, disableWarning: true });
  const adapterOptions = adapter.optionsFactory(adapter.connection);

  new TransactionHost<TransactionalAdapterTypeOrm>({
    ...adapterOptions,
    connectionName: undefined,
    enableTransactionProxy: false,
    defaultTxOptions: {},
    extraProviderTokens: [],
  });
}
