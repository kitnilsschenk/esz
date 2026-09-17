import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { IngestPgModule } from './ingest-pg.module';

describe('IngestPgModule (ADR-0011 C3 — Shutdown)', () => {
  it('schliesst den Verbindungspool genau einmal, auch bei doppeltem Shutdown', async () => {
    // Regression: Beim Betrieb als Container liefen zwei Shutdown-Pfade
    // gleichzeitig (Nest-Signal-Handler UND eigener Handler in
    // `worker-main.ts`). `pg.Pool.end()` wirft beim zweiten Aufruf, und der
    // geordnete Halt endete mit Exit-Code 1 — als ueberwachter Dienst also
    // jeder normale Stopp ein „Absturz". Vor dem Fix war dieser Test rot.
    const end = vi.fn().mockResolvedValue(undefined);
    const modul = new IngestPgModule({ end } as unknown as Pool);

    await modul.onApplicationShutdown();
    await modul.onApplicationShutdown();

    expect(end).toHaveBeenCalledTimes(1);
  });

  it('gibt einen Fehler beim Schliessen weiter, statt ihn zu verschlucken', async () => {
    // Die Idempotenz darf keine Fehlerunterdrueckung werden: Ein Pool, der
    // sich nicht schliessen laesst, ist ein Befund.
    const end = vi.fn().mockRejectedValue(new Error('Verbindung haengt'));
    const modul = new IngestPgModule({ end } as unknown as Pool);

    await expect(modul.onApplicationShutdown()).rejects.toThrow('Verbindung haengt');
  });
});
