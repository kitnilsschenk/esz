import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { ConsentGateRepository } from './consent-gate.repository';

const ZAEHLER_ID = '018f1e2d-0000-7000-8000-000000000001';

function repositoryMit(rows: readonly Record<string, unknown>[]): {
  readonly repository: ConsentGateRepository;
  readonly query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn().mockResolvedValue({ rows });
  return { repository: new ConsentGateRepository({ query } as unknown as Pool), query };
}

describe('ConsentGateRepository (ADR-0012 E5/Stufe C, A12-11/A12-12/C-2)', () => {
  it('meldet erlaubt=true, wenn die Funktion true liefert', async () => {
    const { repository } = repositoryMit([{ wirksam: true }]);

    expect(await repository.messdatenVerarbeitungErlaubt(ZAEHLER_ID)).toBe(true);
  });

  it('meldet erlaubt=false, wenn die Funktion false liefert', async () => {
    const { repository } = repositoryMit([{ wirksam: false }]);

    expect(await repository.messdatenVerarbeitungErlaubt(ZAEHLER_ID)).toBe(false);
  });

  it('fail-closed: false, wenn die Abfrage (unerwartet) keine Zeile liefert', async () => {
    const { repository } = repositoryMit([]);

    expect(await repository.messdatenVerarbeitungErlaubt(ZAEHLER_ID)).toBe(false);
  });

  it('ruft AUSSCHLIESSLICH die SECURITY-DEFINER-Funktion auf — kein SELECT auf eine consent.*-Tabelle', async () => {
    const { repository, query } = repositoryMit([{ wirksam: true }]);

    await repository.messdatenVerarbeitungErlaubt(ZAEHLER_ID);

    const [sql, parameter] = query.mock.calls[0] as [string, readonly unknown[]];
    expect(sql).toContain('consent.ingest_rechtsgrundlage_wirksam($1)');
    expect(sql).not.toMatch(/FROM\s+consent\./i);
    expect(parameter).toEqual([ZAEHLER_ID]);
  });

  it('uebergibt WEDER einen Zweck- NOCH einen Zeitpunkt-Parameter (A12-15/C-2) — GENAU EIN Argument', async () => {
    const { repository, query } = repositoryMit([{ wirksam: true }]);

    await repository.messdatenVerarbeitungErlaubt(ZAEHLER_ID);

    const [, parameter] = query.mock.calls[0] as [string, readonly unknown[]];
    // C-2: Ein frei waehlbarer Zeitpunkt-Parameter machte aus dem
    // Boolean-Orakel ein Historien-Orakel (Binaersuche auf den exakten
    // Widerrufszeitpunkt). Die Signatur darf strukturell KEINEN zweiten
    // Parameter zulassen -- nicht nur "im Normalfall keinen mitgeben".
    expect(parameter).toHaveLength(1);
    expect(parameter[0]).toBe(ZAEHLER_ID);
  });
});
