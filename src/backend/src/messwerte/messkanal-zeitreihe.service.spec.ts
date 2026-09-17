import { describe, expect, it, vi } from 'vitest';
import { MesskanalZeitreiheService } from './messkanal-zeitreihe.service';
import { ProblemDetailsException } from '../common/exceptions/problem-details.exception';
import type { EnergyMesskanalRepository, Messkanal } from '../stammdaten/persistence/energy/energy-messkanal.repository';
import type { MeasurementMesswertRepository } from './persistence/measurement-messwert.repository';

function messkanal(overrides: Partial<Messkanal> = {}): Messkanal {
  return {
    id: 'messkanal-1',
    zaehlerId: 'zaehler-1',
    messgroesse: 'wirkarbeit',
    einheit: 'kWh',
    art: 'kumulativ_zaehlerstand',
    status: 'aktiv',
    obisKennzahl: null,
  istUntermessung: false,
  richtung: 'bezug',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createService(overrides: {
  messkanal?: Messkanal | undefined;
  rohwerte?: { readonly ts: string; readonly wert: number; readonly qualitaet: string; readonly herkunft: string }[];
}): { service: MesskanalZeitreiheService; findRohwerteMock: ReturnType<typeof vi.fn> } {
  const findRohwerteMock = vi.fn(() => Promise.resolve(overrides.rohwerte ?? []));

  const messkanalRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.messkanal)),
  } as unknown as EnergyMesskanalRepository;

  const messwertRepo = {
    findRohwerte: findRohwerteMock,
  } as unknown as MeasurementMesswertRepository;

  const service = new MesskanalZeitreiheService(messkanalRepo, messwertRepo);
  return { service, findRohwerteMock };
}

describe('MesskanalZeitreiheService (read:verbrauch_detail, break-glass wiederverwendet)', () => {
  it('lehnt ab (404), wenn der Messkanal nicht existiert', async () => {
    const { service } = createService({ messkanal: undefined });

    await expect(
      service.zeitreihe('messkanal-1', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (400), wenn von nicht VOR bis liegt', async () => {
    const { service } = createService({ messkanal: messkanal() });

    await expect(
      service.zeitreihe('messkanal-1', '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('liefert Messkanal-Metadaten (messgroesse/einheit/art) PLUS die Rohwerte inkl. qualitaet/herkunft', async () => {
    const { service } = createService({
      messkanal: messkanal({ id: 'messkanal-42', messgroesse: 'volumen', einheit: 'm3', art: 'intervall_verbrauch' }),
      rohwerte: [{ ts: '2026-01-01T00:00:00.000Z', wert: 5, qualitaet: 'gemessen', herkunft: 'ingest_live' }],
    });

    const result = await service.zeitreihe('messkanal-42', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z');

    expect(result).toEqual({
      messkanalId: 'messkanal-42',
      messgroesse: 'volumen',
      einheit: 'm3',
      art: 'intervall_verbrauch',
      werte: [{ ts: '2026-01-01T00:00:00.000Z', wert: 5, qualitaet: 'gemessen', herkunft: 'ingest_live' }],
    });
  });
});
