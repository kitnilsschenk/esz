import { beforeAll, describe, expect, it, vi } from 'vitest';
import { StandortBaumService } from './standort-baum.service';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import type { EnergyStandortRepository, Standort } from '../persistence/energy/energy-standort.repository';
import type { EnergyZaehlerStandortRepository } from '../persistence/energy/energy-zaehler-standort.repository';
import type { EnergyEndkundeRepository, Endkunde } from '../persistence/energy/energy-endkunde.repository';

function endkunde(overrides: Partial<Endkunde> = {}): Endkunde {
  return {
    id: 'endkunde-1',
    verarbeitungsStatus: 'aktiv',
    consentStatus: 'fehlt',
    consentTextVersion: null,
    vonWissAuswertungAusgenommen: false,
    endkundengruppe: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function standort(overrides: Partial<Standort> = {}): Standort {
  return {
    id: 'standort-1',
    endkundeId: 'endkunde-1',
    parentId: null,
    typ: 'liegenschaft',
    pfad: ['standort-1'],
    ebene: 0,
    sortierung: 0,
    klimareferenz: null,
    status: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * KRITISCHER Test (Arbeitsauftrag): `read:standort` darf NIE `identity`
 * berühren. Da `StandortBaumService` per Konstruktor-Signatur GAR KEIN
 * `identity.*`-Repository injizieren KANN (s. Klassen-Dok), belegt bereits
 * die erfolgreiche Instanziierung mit AUSSCHLIESSLICH `energy.*`-Mocks diese
 * Eigenschaft strukturell — zusätzlich verifizieren die Tests unten, dass
 * `hatAdresse` rein strukturell (kein DB-Roundtrip) berechnet wird.
 */
describe('StandortBaumService (ADR-0010 D5) — liste()', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  function createService(overrides: {
    endkunde?: Endkunde | undefined;
    standorte?: readonly Standort[];
    zaehlerAnzahlByStandortId?: ReadonlyMap<string, number>;
  }): StandortBaumService {
    const standortRepo = {
      listByEndkunde: vi.fn(() => Promise.resolve(overrides.standorte ?? [])),
    } as unknown as EnergyStandortRepository;

    const zaehlerStandortRepo = {
      countAktivByStandortIds: vi.fn(() => Promise.resolve(overrides.zaehlerAnzahlByStandortId ?? new Map())),
    } as unknown as EnergyZaehlerStandortRepository;

    const endkundeRepo = {
      findById: vi.fn(() => Promise.resolve(overrides.endkunde)),
    } as unknown as EnergyEndkundeRepository;

    return new StandortBaumService(standortRepo, zaehlerStandortRepo, endkundeRepo);
  }

  it('liefert die Struktur OHNE Label-Felder (Pseudonyme, typ, ebene, pfad, status, hatAdresse, zaehlerAnzahl)', async () => {
    const service = createService({
      endkunde: endkunde(),
      standorte: [standort({ id: 's1', typ: 'liegenschaft', parentId: null, pfad: ['s1'] })],
      zaehlerAnzahlByStandortId: new Map([['s1', 4]]),
    });

    const result = await service.liste('endkunde-1', {});

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('bezeichnung');
    expect(result[0]).not.toHaveProperty('anschrift');
    expect(result[0]).toMatchObject({ id: 's1', typ: 'liegenschaft', ebene: 0, status: 'aktiv', hatAdresse: true, zaehlerAnzahl: 4 });
    expect(result[0]?.pfad).toEqual(['s1']);
  });

  it('hatAdresse ist STRUKTURELL berechnet (D4-Adressfaehigkeit): true fuer Wurzelknoten und gebaeude, sonst false', async () => {
    const service = createService({
      endkunde: endkunde(),
      standorte: [
        standort({ id: 'wurzel', typ: 'liegenschaft', parentId: null }),
        standort({ id: 'gebaeude', typ: 'gebaeude', parentId: 'wurzel', ebene: 1 }),
        standort({ id: 'raum', typ: 'raum', parentId: 'gebaeude', ebene: 2 }),
      ],
    });

    const result = await service.liste('endkunde-1', {});

    expect(result.find((s) => s.id === 'wurzel')?.hatAdresse).toBe(true);
    expect(result.find((s) => s.id === 'gebaeude')?.hatAdresse).toBe(true);
    expect(result.find((s) => s.id === 'raum')?.hatAdresse).toBe(false);
  });

  it('lehnt ab (404), wenn der Endkunde nicht existiert', async () => {
    const service = createService({ endkunde: undefined });

    await expect(service.liste('endkunde-1', {})).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('zaehlerAnzahl ist 0 fuer Standorte ohne aktuell verortete Zaehler', async () => {
    const service = createService({
      endkunde: endkunde(),
      standorte: [standort({ id: 's1' })],
      zaehlerAnzahlByStandortId: new Map(),
    });

    const result = await service.liste('endkunde-1', {});

    expect(result[0]?.zaehlerAnzahl).toBe(0);
  });
});
