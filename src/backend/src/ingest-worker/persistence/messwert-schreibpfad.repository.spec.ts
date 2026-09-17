import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { Pool } from 'pg';
import { MesswertSchreibpfadRepository } from './messwert-schreibpfad.repository';
import { IngestLoggerService } from '../ingest-flow/ingest-logger.service';

function buildFakeLogger(): IngestLoggerService & { infraFehler: Mock } {
  return {
    quarantaene: vi.fn(),
    messwertGeschrieben: vi.fn(),
    infraFehler: vi.fn(),
  } as unknown as IngestLoggerService & { infraFehler: Mock };
}

function buildFakePool(queryImpl: Mock): { pool: Pool; client: { query: Mock; release: Mock } } {
  const client = { query: queryImpl, release: vi.fn() };
  const pool = { connect: vi.fn().mockResolvedValue(client) };
  return { pool: pool as unknown as Pool, client };
}

const INPUT = {
  messkanalKey: 1,
  ts: '2026-01-01T00:00:00.000Z',
  wert: 1,
  qualitaet: 0,
  herkunft: 0,
};

describe('MesswertSchreibpfadRepository (SA-5 — Rollback-Fehler-Logging, nicht still verschluckt)', () => {
  it('committet erfolgreich und loggt KEINEN Rollback-Fehler (kein ROLLBACK auf dem Erfolgspfad)', async () => {
    const queryImpl = vi
      .fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1 }) // messwert-Upsert
      .mockResolvedValueOnce(undefined) // kanal_status-Upsert
      .mockResolvedValueOnce(undefined); // COMMIT
    const { pool, client } = buildFakePool(queryImpl);
    const logger = buildFakeLogger();
    const repo = new MesswertSchreibpfadRepository(pool, logger);

    const result = await repo.upsertMesswertUndFreshness(INPUT);

    expect(result.geschrieben).toBe(true);
    expect(logger.infraFehler).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('SA-5: Rollback-Fehler wird geloggt, aber der URSPRUENGLICHE Fehler bleibt der geworfene (nicht verdeckt)', async () => {
    const originalError = new Error('messwert-Upsert fehlgeschlagen (z. B. Verbindung waehrend Transaktion verloren)');
    const rollbackError = new Error('ROLLBACK fehlgeschlagen (Verbindung bereits weg)');
    const queryImpl = vi
      .fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockRejectedValueOnce(originalError) // messwert-Upsert wirft
      .mockRejectedValueOnce(rollbackError); // ROLLBACK wirft EBENFALLS
    const { pool, client } = buildFakePool(queryImpl);
    const logger = buildFakeLogger();
    const repo = new MesswertSchreibpfadRepository(pool, logger);

    await expect(repo.upsertMesswertUndFreshness(INPUT)).rejects.toBe(originalError);

    expect(logger.infraFehler).toHaveBeenCalledTimes(1);
    expect(logger.infraFehler).toHaveBeenCalledWith('messwert_schreibpfad_rollback_fehlgeschlagen', rollbackError);
    // client.release() laeuft trotz doppeltem Fehler unveraendert (kein Leak eines PoolClient).
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('loggt KEINEN Rollback-Fehler, wenn das ROLLBACK selbst erfolgreich ist (nur der urspruengliche Fehler wird geworfen)', async () => {
    const originalError = new Error('messwert-Upsert fehlgeschlagen');
    const queryImpl = vi
      .fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockRejectedValueOnce(originalError) // messwert-Upsert wirft
      .mockResolvedValueOnce(undefined); // ROLLBACK erfolgreich
    const { pool, client } = buildFakePool(queryImpl);
    const logger = buildFakeLogger();
    const repo = new MesswertSchreibpfadRepository(pool, logger);

    await expect(repo.upsertMesswertUndFreshness(INPUT)).rejects.toBe(originalError);

    expect(logger.infraFehler).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
