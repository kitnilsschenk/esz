import { existsSync } from 'node:fs';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import { Propagation, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runUp } from '@edms/migrate';
import { PersistenceModule } from '../common/persistence/persistence.module';
import { AuditModule } from './audit.module';
import { AuditService } from './audit.service';
import { startTestPostgres } from '../health/test-support/testcontainer-postgres';

/**
 * Isolierter DB-Integrationstest des `AuditService`-Schreibpfads (ADR-0003
 * §17.1), OHNE HTTP/Guard-Stack (der Ende-zu-Ende-Beweis inkl. Interceptor-
 * Kette + Savepoints liegt in
 * `common/interceptors/transaction-chain.integration.spec.ts`). Läuft gegen
 * einen echten Postgres+TimescaleDB-Testcontainer — KEIN DB-Mock
 * (`.claude/rules/tests.md`).
 */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('Repo-Root nicht gefunden (pnpm-workspace.yaml fehlt im Pfadbaum).');
    }
    dir = parent;
  }
}

interface AuditEventQueryRow {
  readonly lane: number;
  readonly tag_utc: string;
  readonly seq: string;
  readonly prev_hash: Buffer;
  readonly zeilen_hash: Buffer;
}

describe('AuditService (Testcontainer PG+TimescaleDB) — audit.append_event-Kontrakt (ADR-0003 §17.1)', () => {
  let container: Awaited<ReturnType<typeof startTestPostgres>>;
  let moduleRef: TestingModule;
  let auditService: AuditService;
  let txHost: TransactionHost<TransactionalAdapterTypeOrm>;
  let verifyClient: Client;

  beforeAll(async () => {
    container = await startTestPostgres();
    process.env['DATABASE_URL'] = container.getConnectionUri();

    const migrationsDir = path.join(findRepoRoot(process.cwd()), 'migrations');
    const migrationClient = new Client({ connectionString: container.getConnectionUri() });
    await migrationClient.connect();
    await runUp(migrationClient, migrationsDir);
    await migrationClient.query(
      "INSERT INTO audit.event_typ (code) VALUES ('test.audit.direkt') ON CONFLICT DO NOTHING",
    );
    await migrationClient.query(
      `INSERT INTO audit.event_typ_version
         (id, code, objekt_typ, aktion_kategorie, erlaubte_kontext_keys, rolle_erfassen, pflichtereignis, aktiv, beschreibung, gueltig_ab)
       VALUES
         (gen_random_uuid(), 'test.audit.direkt', 'test_objekt', 'erstellen', ARRAY['grund']::text[], false, false, true, 'Test-Fixture', now())`,
    );
    await migrationClient.end();

    verifyClient = new Client({ connectionString: container.getConnectionUri() });
    await verifyClient.connect();

    moduleRef = await Test.createTestingModule({ imports: [PersistenceModule, AuditModule] }).compile();
    auditService = moduleRef.get(AuditService);
    txHost = moduleRef.get<TransactionHost<TransactionalAdapterTypeOrm>>(TransactionHost);
  }, 120_000);

  afterAll(async () => {
    await verifyClient?.end().catch(() => undefined);
    await moduleRef?.close().catch(() => undefined);
    await container?.stop().catch(() => undefined);
  });

  it('schreibt über GENAU EINEN audit.append_event(...)-Aufruf und liefert die gesiegelte Zeile zurück', async () => {
    const result = await txHost.withTransaction(Propagation.Required, () =>
      auditService.append({
        eventTyp: 'test.audit.direkt',
        actorTyp: 'benutzer',
        actorSub: 'sub-x',
        ergebnis: 'ok',
        kontext: { grund: 'integrationstest' },
      }),
    );

    expect(result.eventTyp).toBe('test.audit.direkt');
    expect(result.ergebnis).toBe('ok');

    const row = await verifyClient.query(
      'SELECT actor_sub, kontext FROM audit.event WHERE event_id = $1',
      [result.eventId],
    );
    expect(row.rowCount).toBe(1);
    expect((row.rows[0] as { actor_sub: string }).actor_sub).toBe('sub-x');
    expect((row.rows[0] as { kontext: unknown }).kontext).toEqual({ grund: 'integrationstest' });
  }, 30_000);

  it('jede Zeile verkettet exakt mit ihrem unmittelbaren Lane-Vorgänger (Hash-Kette, ADR-0003 §14)', async () => {
    const appended = await txHost.withTransaction(Propagation.Required, () =>
      auditService.append({ eventTyp: 'test.audit.direkt', actorTyp: 'benutzer', ergebnis: 'ok' }),
    );

    const rowResult = await verifyClient.query(
      'SELECT lane, tag_utc, seq, prev_hash, zeilen_hash FROM audit.event WHERE event_id = $1',
      [appended.eventId],
    );
    const row = rowResult.rows[0] as AuditEventQueryRow;

    const predecessorResult = await verifyClient.query(
      'SELECT zeilen_hash FROM audit.event WHERE lane = $1 AND tag_utc = $2 AND seq = $3',
      [row.lane, row.tag_utc, Number(row.seq) - 1],
    );

    if (predecessorResult.rowCount === 0) {
      // Erste Zeile dieser Lane/dieses Tages: prev_hash MUSS der
      // deterministische Genesis-Hash sein (ADR-0003 §14.3).
      const genesisResult = await verifyClient.query(
        'SELECT audit.genesis(1::smallint, $1::smallint, $2::date) AS genesis',
        [row.lane, row.tag_utc],
      );
      expect(row.prev_hash).toEqual((genesisResult.rows[0] as { genesis: Buffer }).genesis);
    } else {
      expect(row.prev_hash).toEqual((predecessorResult.rows[0] as { zeilen_hash: Buffer }).zeilen_hash);
    }
  }, 30_000);

  it('lehnt Envelopes gegen unbekannte Katalog-Codes DB-seitig ab (FK + Trigger, Katalog-Governance)', async () => {
    await expect(
      txHost.withTransaction(Propagation.Required, () =>
        auditService.append({ eventTyp: 'nicht.im.katalog.vorhanden', actorTyp: 'benutzer', ergebnis: 'ok' }),
      ),
    ).rejects.toThrow();
  }, 30_000);
});
