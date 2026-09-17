import { Propagation } from '@nestjs-cls/transactional';
import type { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import type { Reflector } from '@nestjs/core';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TransactionInterceptor } from './transaction.interceptor';
import {
  createFailingCallHandler,
  createFakeCallHandler,
  createFakeExecutionContext,
} from './test-support/fake-execution-context';

interface TxHostMock {
  readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>;
  readonly withTransaction: ReturnType<typeof vi.fn>;
}

/**
 * Liefert NEBEN dem `TransactionHost`-Test-Double auch eine benannte
 * Referenz auf `withTransaction` — `expect(txHost.withTransaction)` würde
 * `@typescript-eslint/unbound-method` auslösen (`TransactionHost` ist Typ
 * aus `@nestjs-cls/transactional`, nicht unser eigener, zum Anpassen).
 */
function createTxHostMock(): TxHostMock {
  const withTransaction = vi.fn((_propagation: Propagation, fn: () => Promise<unknown>) => fn());
  const txHost = { withTransaction } as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
  return { txHost, withTransaction };
}

function createReflectorMock(skip: boolean | undefined): Reflector {
  return { getAllAndOverride: vi.fn(() => skip) } as unknown as Reflector;
}

describe('TransactionInterceptor (ADR-0002 Teil B §15, Konflikt B; Scoping-Fix Regression Health)', () => {
  it('öffnet Propagation.Required und gibt den Erfolgswert unverändert durch', async () => {
    const { txHost, withTransaction } = createTxHostMock();
    const interceptor = new TransactionInterceptor(txHost, createReflectorMock(false));
    const context = createFakeExecutionContext({});

    const result = await firstValueFrom(interceptor.intercept(context, createFakeCallHandler('wert')));

    expect(result).toBe('wert');
    expect(withTransaction).toHaveBeenCalledWith(Propagation.Required, expect.any(Function));
  });

  it('lässt withTransaction() AUFLÖSEN, auch wenn die nachgelagerte Kette wirft (Konflikt B)', async () => {
    const { txHost, withTransaction } = createTxHostMock();
    const interceptor = new TransactionInterceptor(txHost, createReflectorMock(false));
    const context = createFakeExecutionContext({});
    const boom = new Error('denied-mit-audit-bereits-geschrieben');

    // withTransaction() selbst darf NICHT rejecten -- sonst würde die äußere
    // Transaktion (und eine darin vom AuditActionInterceptor bereits
    // geschriebene Audit-Zeile) zurückgerollt (exakt Konflikt B). Der
    // Fehler muss den Aufrufer dennoch erreichen (403/500 im
    // Exception-Filter) — s. `.pipe(map(...))`-Schritt NACH `from(...)`.
    await expect(firstValueFrom(interceptor.intercept(context, createFailingCallHandler(boom)))).rejects.toBe(boom);

    expect(withTransaction).toHaveResolved();
  });

  it('@SkipTransaction(): öffnet KEINE Transaktion und reicht Erfolg unverändert durch (Health-Regression-Fix)', async () => {
    const { txHost, withTransaction } = createTxHostMock();
    const interceptor = new TransactionInterceptor(txHost, createReflectorMock(true));
    const context = createFakeExecutionContext({});

    const result = await firstValueFrom(interceptor.intercept(context, createFakeCallHandler('wert')));

    expect(result).toBe('wert');
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('@SkipTransaction(): ein Fehler aus der Kette (z. B. HealthServices eigene 503) läuft OHNE Transaktions-Versuch durch', async () => {
    const { txHost, withTransaction } = createTxHostMock();
    const interceptor = new TransactionInterceptor(txHost, createReflectorMock(true));
    const context = createFakeExecutionContext({});
    const serviceUnavailable = new Error('dependency-unavailable');

    await expect(
      firstValueFrom(interceptor.intercept(context, createFailingCallHandler(serviceUnavailable))),
    ).rejects.toBe(serviceUnavailable);

    expect(withTransaction).not.toHaveBeenCalled();
  });
});
