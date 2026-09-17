import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { HerkunftAbgleichRepository } from './herkunft-abgleich.repository';

const ZAEHLER_ID = '018f1e2d-0000-7000-8000-000000000001';
const TENANT_ID = '7a000000-0000-0000-0000-00000000000a';
const ENDKUNDE_A = 'e0000000-0000-0000-0000-00000000000a';
const ENDKUNDE_B = 'e0000000-0000-0000-0000-00000000000b';

function repositoryMit(rows: readonly Record<string, unknown>[]): {
  readonly repository: HerkunftAbgleichRepository;
  readonly query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn().mockResolvedValue({ rows });
  return { repository: new HerkunftAbgleichRepository({ query } as unknown as Pool), query };
}

describe('HerkunftAbgleichRepository (ADR-0011 B3/D4)', () => {
  it('meldet einen Widerspruch, wenn Tenant und Zaehler auf verschiedene Endkunden zeigen', async () => {
    const { repository } = repositoryMit([
      { tatsaechlicher_endkunde_id: ENDKUNDE_B, erwarteter_endkunde_id: ENDKUNDE_A },
    ]);

    const ergebnis = await repository.pruefe(ZAEHLER_ID, TENANT_ID);

    expect(ergebnis).toEqual({
      art: 'widerspruch',
      erwarteterEndkundeId: ENDKUNDE_A,
      tatsaechlicherEndkundeId: ENDKUNDE_B,
    });
  });

  it('meldet stimmig, wenn beide Seiten denselben Endkunden nennen', async () => {
    const { repository } = repositoryMit([
      { tatsaechlicher_endkunde_id: ENDKUNDE_A, erwarteter_endkunde_id: ENDKUNDE_A },
    ]);

    expect(await repository.pruefe(ZAEHLER_ID, TENANT_ID)).toEqual({ art: 'stimmig' });
  });

  it('meldet kein_mapping, wenn der Tenant nicht zugeordnet ist — NICHT stimmig', async () => {
    // Der Unterschied ist der Punkt: "ungeprueft" darf nicht wie "geprueft
    // und in Ordnung" aussehen. Der Aufrufer entscheidet, was er damit tut.
    const { repository } = repositoryMit([
      { tatsaechlicher_endkunde_id: ENDKUNDE_A, erwarteter_endkunde_id: null },
    ]);

    expect(await repository.pruefe(ZAEHLER_ID, TENANT_ID)).toEqual({ art: 'kein_mapping' });
  });

  it('behauptet keinen Widerspruch, wenn der Zaehler gar nicht auffindbar ist', async () => {
    // Eine leere Ergebnismenge heisst: die Zugehoerigkeit war nicht
    // ermittelbar. Daraus einen Widerspruch zu machen waere eine
    // Falschaussage ueber eine Pruefung, die nie stattgefunden hat.
    const { repository } = repositoryMit([]);

    expect(await repository.pruefe(ZAEHLER_ID, TENANT_ID)).toEqual({ art: 'kein_mapping' });
  });

  it('liest die erwartete Seite mit LIMIT 1 — mehrere Gebaeude eines Tenants sind der Normalfall', async () => {
    const { repository, query } = repositoryMit([
      { tatsaechlicher_endkunde_id: ENDKUNDE_A, erwarteter_endkunde_id: ENDKUNDE_A },
    ]);

    await repository.pruefe(ZAEHLER_ID, TENANT_ID);

    const [sql, parameter] = query.mock.calls[0] as [string, readonly unknown[]];
    expect(sql).toContain('LIMIT 1');
    expect(parameter).toEqual([ZAEHLER_ID, TENANT_ID]);
  });

  it('liest aus energy.system NUR die zwei Spalten, fuer die der Grant gilt (RL-1)', async () => {
    const { repository, query } = repositoryMit([
      { tatsaechlicher_endkunde_id: ENDKUNDE_A, erwarteter_endkunde_id: ENDKUNDE_A },
    ]);

    await repository.pruefe(ZAEHLER_ID, TENANT_ID);

    // Kein `sys.*`: der spaltenscharfe Grant aus V0042 deckt nur
    // (id, endkunde_id) -- ein Stern liefe zur Laufzeit in "permission denied".
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).not.toContain('sys.*');
    expect(sql).toContain('sys.endkunde_id');
  });
});
