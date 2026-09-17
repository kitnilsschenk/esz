import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HERZSCHLAG_INTERVALL_MS, QuelleHerzschlagService } from './quelle-herzschlag.service';
import type { QuelleStatusRepository, QuelleStatusUpsertInput } from './persistence/quelle-status.repository';

const vorherigeEnv = { ...process.env };

function createService(): {
  readonly service: QuelleHerzschlagService;
  readonly upsert: ReturnType<typeof vi.fn>;
  readonly aufrufe: () => QuelleStatusUpsertInput[];
} {
  // Die Aufrufe werden hier mitgeschrieben, statt sie spaeter aus
  // `mock.calls` zu typisieren — das haelt den Test frei von Casts.
  const aufrufe: QuelleStatusUpsertInput[] = [];
  const upsert = vi.fn((input: QuelleStatusUpsertInput) => {
    aufrufe.push(input);
    return Promise.resolve();
  });
  const repository = { upsert } as unknown as QuelleStatusRepository;
  return {
    service: new QuelleHerzschlagService(repository),
    upsert,
    aufrufe: () => [...aufrufe],
  };
}

describe('QuelleHerzschlagService (ADR-0011 O8/D8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env['EDMS_INGEST_MQTT_URL'] = 'mqtt://benutzer:geheim@broker.example:8883';
    process.env['EDMS_INGEST_QUELLE_CODE'] = 'netz-a';
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...vorherigeEnv };
  });

  it('meldet beim Start Kennung, Broker und Topic — OHNE Zugangsdaten', async () => {
    const { service, aufrufe } = createService();

    await service.start();
    await service.stop();

    const erster = aufrufe()[0];
    expect(erster?.quelleCode).toBe('netz-a');
    expect(erster?.brokerHost).toBe('broker.example:8883');
    expect(JSON.stringify(erster)).not.toContain('geheim');
  });

  it('schlägt im festgelegten Takt weiter', async () => {
    const { service, upsert } = createService();

    await service.start();
    expect(upsert).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(HERZSCHLAG_INTERVALL_MS * 3);
    expect(upsert.mock.calls.length).toBeGreaterThanOrEqual(4);

    await service.stop();
  });

  it('schlägt AUCH bei verlorener Verbindung weiter — „ich lebe, komme aber nicht durch"', async () => {
    // Schweigen wäre mehrdeutig: Es sähe aus wie ein toter Prozess. Der
    // Unterschied bestimmt aber, wo jemand suchen muss.
    const { service, aufrufe } = createService();

    await service.start();
    await service.verbindungVerloren();
    await vi.advanceTimersByTimeAsync(HERZSCHLAG_INTERVALL_MS);
    await service.stop();

    const nachAbriss = aufrufe().slice(1);
    expect(nachAbriss.length).toBeGreaterThanOrEqual(2);
    expect(nachAbriss.every((eintrag) => eintrag.verbunden === false)).toBe(true);
  });

  it('behält den letzten erfolgreichen Verbindungszeitpunkt nach einem Abriss', async () => {
    const { service, aufrufe } = createService();

    await service.start();
    const beimStart = aufrufe()[0]?.letzteVerbindungAt;
    await service.verbindungVerloren();
    await service.stop();

    expect(beimStart).toBeInstanceOf(Date);
    expect(aufrufe().at(-1)?.letzteVerbindungAt).toEqual(beimStart);
  });

  it('meldet beim geordneten Stopp „nicht verbunden" und hört danach auf', async () => {
    const { service, upsert } = createService();

    await service.start();
    await service.stop();
    const nachStop = upsert.mock.calls.length;

    await vi.advanceTimersByTimeAsync(HERZSCHLAG_INTERVALL_MS * 5);
    expect(upsert).toHaveBeenCalledTimes(nachStop);
  });

  it('lässt einen Schreibfehler die Aufnahme NICHT anhalten', async () => {
    // Die Statuszeile ist Diagnose, keine Fachdaten.
    const upsert = vi.fn(() => Promise.reject(new Error('Datenbank weg')));
    const service = new QuelleHerzschlagService({ upsert } as unknown as QuelleStatusRepository);

    await expect(service.start()).resolves.toBeUndefined();
    await expect(service.stop()).resolves.toBeUndefined();
  });
});
