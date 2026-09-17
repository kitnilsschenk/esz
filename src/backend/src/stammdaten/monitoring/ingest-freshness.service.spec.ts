import { describe, expect, it, vi } from 'vitest';
import { IngestFreshnessService } from './ingest-freshness.service';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import type {
  IngestFreshnessRepository,
  MesskanalFreshnessEintrag,
  UeberfaelligerKanalEintrag,
} from '../persistence/ingest/ingest-freshness.repository';
import type { EnergyZaehlerRepository, Zaehler } from '../persistence/energy/energy-zaehler.repository';

function zaehler(overrides: Partial<Zaehler> = {}): Zaehler {
  return {
    id: 'zaehler-1',
    systemId: 'system-1',
    geraetetyp: 'Testzaehler',
    energietraeger: 'strom',
    status: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function ueberfaelligerKanal(overrides: Partial<UeberfaelligerKanalEintrag> = {}): UeberfaelligerKanalEintrag {
  return {
    messkanalId: 'messkanal-1',
    zaehlerId: 'zaehler-1',
    letzteUebertragung: '2026-01-01T00:00:00.000Z',
    ueberfaellig: true,
    ausfallStatus: null,
    ausfallSeit: null,
    ...overrides,
  };
}

function messkanalFreshness(overrides: Partial<MesskanalFreshnessEintrag> = {}): MesskanalFreshnessEintrag {
  return {
    messkanalId: 'messkanal-1',
    letzteUebertragung: '2026-01-01T00:00:00.000Z',
    ueberfaellig: true,
    ausfallStatus: null,
    ausfallSeit: null,
    ...overrides,
  };
}

function createService(overrides: {
  zaehler?: Zaehler | undefined;
  listUeberfaellig?: readonly UeberfaelligerKanalEintrag[];
  findByZaehlerId?: readonly MesskanalFreshnessEintrag[];
}): {
  service: IngestFreshnessService;
  listUeberfaelligMock: ReturnType<typeof vi.fn>;
  findByZaehlerIdMock: ReturnType<typeof vi.fn>;
} {
  const listUeberfaelligMock = vi.fn(() => Promise.resolve([...(overrides.listUeberfaellig ?? [])]));
  const findByZaehlerIdMock = vi.fn(() => Promise.resolve([...(overrides.findByZaehlerId ?? [])]));

  const freshnessRepo = {
    listUeberfaellig: listUeberfaelligMock,
    findByZaehlerId: findByZaehlerIdMock,
  } as unknown as IngestFreshnessRepository;

  const zaehlerRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.zaehler)),
  } as unknown as EnergyZaehlerRepository;

  const service = new IngestFreshnessService(freshnessRepo, zaehlerRepo);

  return { service, listUeberfaelligMock, findByZaehlerIdMock };
}

describe('IngestFreshnessService — listeUeberfaellig() (TB-04-Ausfall-Liste, ADR-0005 §27)', () => {
  it('reicht eine berechnete Schwelle (ISO-UTC) an das Repository durch', async () => {
    const { service, listUeberfaelligMock } = createService({ listUeberfaellig: [ueberfaelligerKanal()] });

    await service.listeUeberfaellig({ limit: 50 });

    expect(listUeberfaelligMock).toHaveBeenCalledTimes(1);
    const [uebergebeneOptionen] = listUeberfaelligMock.mock.calls[0] as [{ limit: number; schwelle: string }];
    expect(uebergebeneOptionen.limit).toBe(50);
    expect(uebergebeneOptionen.schwelle).toMatch(/Z$/);
  });

  it('mappt Repository-Eintraege 1:1 auf AusfallListeItem (PII-frei, nur Pseudonym-Surrogate)', async () => {
    const { service } = createService({
      listUeberfaellig: [
        ueberfaelligerKanal({ messkanalId: 'kanal-frisch', ueberfaellig: false, letzteUebertragung: '2026-07-01T00:00:00.000Z' }),
      ],
    });

    const result = await service.listeUeberfaellig({ limit: 50 });

    expect(result.daten).toEqual([
      {
        messkanalId: 'kanal-frisch',
        zaehlerId: 'zaehler-1',
        letzteUebertragung: '2026-07-01T00:00:00.000Z',
        ueberfaellig: false,
        ausfallStatus: null,
        ausfallSeit: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('bezeichnung');
  });
});

describe('IngestFreshnessService — freshnessJeMesskanal() (Zaehler-Detailseite, KEIN break-glass)', () => {
  it('lehnt ab (404), wenn der Zaehler nicht existiert', async () => {
    const { service } = createService({ zaehler: undefined });

    await expect(service.freshnessJeMesskanal('zaehler-1')).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('liefert eine leere Liste (KEIN Fehler), wenn der Zaehler existiert, aber keine Messkanaele hat', async () => {
    const { service } = createService({ zaehler: zaehler(), findByZaehlerId: [] });

    const result = await service.freshnessJeMesskanal('zaehler-1');

    expect(result).toEqual([]);
  });

  it('liefert letzteUebertragung=null + ueberfaellig=true fuer einen Kanal, der noch nie Daten geliefert hat (Empty-State)', async () => {
    const { service } = createService({
      zaehler: zaehler(),
      findByZaehlerId: [messkanalFreshness({ letzteUebertragung: null, ueberfaellig: true })],
    });

    const result = await service.freshnessJeMesskanal('zaehler-1');

    expect(result[0]).toMatchObject({ letzteUebertragung: null, ueberfaellig: true });
  });
});
