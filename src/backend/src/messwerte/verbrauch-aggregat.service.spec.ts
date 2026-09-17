import { describe, expect, it, vi } from 'vitest';
import { VerbrauchAggregatService } from './verbrauch-aggregat.service';
import { ProblemDetailsException } from '../common/exceptions/problem-details.exception';
import type { EnergyStandortRepository, Standort } from '../stammdaten/persistence/energy/energy-standort.repository';
import type { Zaehler } from '../stammdaten/persistence/energy/energy-zaehler.repository';
import type { MeasurementMesswertRepository, VerbrauchAggregatZeile } from './persistence/measurement-messwert.repository';

function standort(overrides: Partial<Standort> = {}): Standort {
  return {
    id: 'standort-1',
    endkundeId: 'endkunde-1',
    parentId: null,
    typ: 'gebaeude',
    pfad: ['standort-1'],
    ebene: 0,
    sortierung: 0,
    klimareferenz: null,
    status: 'aktiv',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function zaehler(overrides: Partial<Zaehler> = {}): Zaehler {
  return {
    id: 'zaehler-1',
    systemId: 'system-1',
    geraetetyp: 'Testzaehler',
    energietraeger: 'strom',
    status: 'aktiv',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createService(overrides: {
  standort?: Standort | undefined;
  zaehlerUnterKnoten?: readonly Zaehler[];
  aggregiertZeilen?: readonly VerbrauchAggregatZeile[];
  aktiveKanaele?: number;
  untermessungen?: number;
}): {
  service: VerbrauchAggregatService;
  findZaehlerUnterKnotenMock: ReturnType<typeof vi.fn>;
  findVerbrauchAggregiertMock: ReturnType<typeof vi.fn>;
} {
  const findZaehlerUnterKnotenMock = vi.fn(() => Promise.resolve(overrides.zaehlerUnterKnoten ?? [zaehler()]));
  const findVerbrauchAggregiertMock = vi.fn(() => Promise.resolve(overrides.aggregiertZeilen ?? []));

  const standortRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.standort)),
    findZaehlerUnterKnoten: findZaehlerUnterKnotenMock,
  } as unknown as EnergyStandortRepository;

  const messwertRepo = {
    findVerbrauchAggregiert: findVerbrauchAggregiertMock,
    ermittleAktiveMesskanaele: vi.fn(() =>
      Promise.resolve({
        hauptmessungen: overrides.aktiveKanaele ?? 0,
        untermessungen: overrides.untermessungen ?? 0,
      }),
    ),
  } as unknown as MeasurementMesswertRepository;

  const service = new VerbrauchAggregatService(standortRepo, messwertRepo);

  return { service, findZaehlerUnterKnotenMock, findVerbrauchAggregiertMock };
}

describe('VerbrauchAggregatService (Verbrauchs-/Messwert-Endpoint, read:verbrauch_aggregat)', () => {
  it('lehnt ab (404), wenn der Standort nicht existiert', async () => {
    const { service } = createService({ standort: undefined });

    await expect(
      service.aggregiertePeriode('standort-1', { von: '2026-01-01T00:00:00.000Z', bis: '2026-01-02T00:00:00.000Z', aufloesung: 'stunde' }),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (400), wenn von nicht VOR bis liegt', async () => {
    const { service } = createService({ standort: standort() });

    await expect(
      service.aggregiertePeriode('standort-1', { von: '2026-01-02T00:00:00.000Z', bis: '2026-01-01T00:00:00.000Z', aufloesung: 'tag' }),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (400), wenn von gleich bis ist (kein leeres Intervall)', async () => {
    const { service } = createService({ standort: standort() });

    await expect(
      service.aggregiertePeriode('standort-1', { von: '2026-01-01T00:00:00.000Z', bis: '2026-01-01T00:00:00.000Z', aufloesung: 'tag' }),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('nutzt Default stichtag=bis und inklusiveUnterknoten=true, wenn nicht angegeben', async () => {
    const { service, findZaehlerUnterKnotenMock } = createService({ standort: standort() });

    await service.aggregiertePeriode('standort-1', {
      von: '2026-01-01T00:00:00.000Z',
      bis: '2026-02-01T00:00:00.000Z',
      aufloesung: 'tag',
    });

    expect(findZaehlerUnterKnotenMock).toHaveBeenCalledWith({
      knotenId: 'standort-1',
      stichtag: '2026-02-01T00:00:00.000Z',
      inklusiveUnterknoten: true,
    });
  });

  it('übernimmt einen expliziten stichtag/inklusiveUnterknoten unverändert', async () => {
    const { service, findZaehlerUnterKnotenMock } = createService({ standort: standort() });

    await service.aggregiertePeriode('standort-1', {
      von: '2026-01-01T00:00:00.000Z',
      bis: '2026-02-01T00:00:00.000Z',
      aufloesung: 'tag',
      stichtag: '2026-01-15T00:00:00.000Z',
      inklusiveUnterknoten: false,
    });

    expect(findZaehlerUnterKnotenMock).toHaveBeenCalledWith({
      knotenId: 'standort-1',
      stichtag: '2026-01-15T00:00:00.000Z',
      inklusiveUnterknoten: false,
    });
  });

  it('reicht die Zähler-IDs aus der Kern-Query an die Aggregations-Query weiter', async () => {
    const { service, findVerbrauchAggregiertMock } = createService({
      standort: standort(),
      zaehlerUnterKnoten: [zaehler({ id: 'zaehler-a' }), zaehler({ id: 'zaehler-b' })],
    });

    await service.aggregiertePeriode('standort-1', {
      von: '2026-01-01T00:00:00.000Z',
      bis: '2026-01-02T00:00:00.000Z',
      aufloesung: 'stunde',
    });

    expect(findVerbrauchAggregiertMock).toHaveBeenCalledWith({
      zaehlerIds: ['zaehler-a', 'zaehler-b'],
      von: '2026-01-01T00:00:00.000Z',
      bis: '2026-01-02T00:00:00.000Z',
      aufloesung: 'stunde',
    });
  });

  it('Lücken (wert===null) erscheinen NICHT in der Zeitreihe, aber werden gezählt (metadaten.erkannteLuecken) — NIEMALS als 0 ausgegeben', async () => {
    const { service } = createService({
      standort: standort(),
      aggregiertZeilen: [
        { zeitpunkt: '2026-01-01T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: 12.5 },
        { zeitpunkt: '2026-01-01T01:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: null },
        { zeitpunkt: '2026-01-01T02:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: null },
      ],
      aktiveKanaele: 2,
    });

    const result = await service.aggregiertePeriode('standort-1', {
      von: '2026-01-01T00:00:00.000Z',
      bis: '2026-01-01T03:00:00.000Z',
      aufloesung: 'stunde',
    });

    expect(result.zeitreihe).toEqual([
      { zeitpunkt: '2026-01-01T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: 12.5 },
    ]);
    expect(result.zeitreihe.every((punkt) => punkt.wert !== 0)).toBe(true);
    expect(result.metadaten).toEqual({
      einbezogeneZaehler: 1,
      einbezogeneKanaele: 2,
      ausgelasseneUntermessungen: 0,
      erkannteLuecken: 2,
    });
  });

  it('gemischte Einheiten/Messgrößen bleiben als getrennte Punkte erhalten (werden nie stumm addiert)', async () => {
    const { service } = createService({
      standort: standort(),
      aggregiertZeilen: [
        { zeitpunkt: '2026-01-01T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: 10 },
        { zeitpunkt: '2026-01-01T00:00:00.000Z', messgroesse: 'volumen', einheit: 'm3', wert: 3 },
      ],
    });

    const result = await service.aggregiertePeriode('standort-1', {
      von: '2026-01-01T00:00:00.000Z',
      bis: '2026-01-02T00:00:00.000Z',
      aufloesung: 'tag',
    });

    expect(result.zeitreihe).toHaveLength(2);
    expect(result.zeitreihe.map((p) => p.wert).sort((a, b) => a - b)).toEqual([3, 10]);
  });
});
