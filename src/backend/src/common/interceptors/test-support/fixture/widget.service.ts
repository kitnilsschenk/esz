import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Propagation, Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';

export interface CreateWidgetInput {
  readonly name: string;
  readonly shouldFail?: boolean;
}

export interface CreatedWidget {
  readonly id: string;
  readonly name: string;
}

/**
 * Test-Fixture "Fach-Service" für den Konflikt-B-Regressionstest (ADR-0002
 * §18: "zwingend"). `@Transactional(Propagation.Nested)`
 * legt einen `SAVEPOINT` an — schlägt die Methode NACH dem `INSERT` fehl,
 * rollt NUR dieser Savepoint zurück; die äußere, vom `TransactionInterceptor`
 * geöffnete (Audit-tragende) Transaktion überlebt und committet regulär.
 *
 * Nur unter `test-support/**` (von der Produktions-Build ausgeschlossen,
 * `tsconfig.build.json`) — niemals Teil des ausgelieferten Backends.
 */
@Injectable()
export class TestWidgetService {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  @Transactional(Propagation.Nested)
  async create(input: CreateWidgetInput): Promise<CreatedWidget> {
    const id = randomUUID();
    await this.txHost.tx.query('INSERT INTO test_fixture.widget (id, name) VALUES ($1, $2)', [id, input.name]);

    if (input.shouldFail === true) {
      throw new Error('Gewollter Fach-Fehler NACH dem INSERT (Konflikt-B-Regressionstest, ADR-0002 §18).');
    }

    return { id, name: input.name };
  }

  async countWidgets(): Promise<number> {
    // Load-bearing Cast (wie in `AuditService.append`): `EntityManager.query`
    // ist `any`-typisiert; die Typisierung über `unknown` + expliziten Cast
    // verhindert, dass `any` in den öffentlichen `number`-Rückgabewert
    // durchsickert.
    const rawRows: unknown = await this.txHost.tx.query('SELECT count(*)::int AS count FROM test_fixture.widget');
    const rows = rawRows as ReadonlyArray<{ readonly count: number }>;

    return rows[0]?.count ?? 0;
  }
}
