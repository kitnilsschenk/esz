import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NutzungsverhaeltnisService } from './nutzungsverhaeltnis.service';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import type { EnergyEndkundeRepository, Endkunde } from '../persistence/energy/energy-endkunde.repository';
import type { EnergyAnschlussnutzerRepository, Anschlussnutzer } from '../persistence/energy/energy-anschlussnutzer.repository';
import type { EnergySystemRepository, System } from '../persistence/energy/energy-system.repository';
import type {
  EnergyNutzungsverhaeltnisRepository,
  Nutzungsverhaeltnis,
} from '../persistence/energy/energy-nutzungsverhaeltnis.repository';

function endkunde(): Endkunde {
  return {
    id: 'endkunde-1',
    verarbeitungsStatus: 'aktiv',
    consentStatus: 'fehlt',
    consentTextVersion: null,
    vonWissAuswertungAusgenommen: false,
    endkundengruppe: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

function anschlussnutzer(endkundeId: string): Anschlussnutzer {
  return {
    id: 'anschlussnutzer-1',
    endkundeId,
    verarbeitungsStatus: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

function system(endkundeId: string): System {
  return {
    id: 'system-1',
    endkundeId,
    bezeichnung: 'Testsystem',
    systemgrenze: 'Gebaeude A',
    systembeschreibung: null,
    standortId: null,
    status: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

function createService(overrides: {
  anschlussnutzerEndkundeId: string;
  systemEndkundeId: string;
}): NutzungsverhaeltnisService {
  const nutzungsverhaeltnisRepo = {
    insert: vi.fn(
      (input: {
        id: string;
        endkundeId: string;
        anschlussnutzerId: string;
        systemId: string;
        datenklasse: string;
        rolle: string;
        gueltigVon: string;
      }) =>
        Promise.resolve({
          ...input,
          gueltigBis: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        } as unknown as Nutzungsverhaeltnis),
    ),
    findById: vi.fn(() => Promise.resolve(undefined)),
  } as unknown as EnergyNutzungsverhaeltnisRepository;

  const endkundeRepo = { findById: vi.fn(() => Promise.resolve(endkunde())) } as unknown as EnergyEndkundeRepository;
  const anschlussnutzerRepo = {
    findById: vi.fn(() => Promise.resolve(anschlussnutzer(overrides.anschlussnutzerEndkundeId))),
  } as unknown as EnergyAnschlussnutzerRepository;
  const systemRepo = {
    findById: vi.fn(() => Promise.resolve(system(overrides.systemEndkundeId))),
  } as unknown as EnergySystemRepository;

  return new NutzungsverhaeltnisService(nutzungsverhaeltnisRepo, endkundeRepo, anschlussnutzerRepo, systemRepo);
}

describe('NutzungsverhaeltnisService.anlegen() — Referenzkonsistenz-SELECT (ADR-0008 §20, B2)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  const gueltigDto = {
    endkundeId: 'endkunde-1',
    anschlussnutzerId: 'anschlussnutzer-1',
    systemId: 'system-1',
    rolle: 'eigentuemer_selbstnutzer' as const,
    gueltigVon: '2026-01-01T00:00:00.000Z',
  };

  it('legt an, wenn Anschlussnutzer UND System zum angegebenen Endkunden gehoeren', async () => {
    const service = createService({ anschlussnutzerEndkundeId: 'endkunde-1', systemEndkundeId: 'endkunde-1' });

    const result = await service.anlegen(gueltigDto);

    expect(result.endkundeId).toBe('endkunde-1');
  });

  it('lehnt ab (400), wenn anschlussnutzer.endkunde_id NICHT zum uebergebenen endkundeId passt', async () => {
    const service = createService({ anschlussnutzerEndkundeId: 'anderer-endkunde', systemEndkundeId: 'endkunde-1' });

    await expect(service.anlegen(gueltigDto)).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('lehnt ab (400), wenn system.endkunde_id NICHT zum uebergebenen endkundeId passt', async () => {
    const service = createService({ anschlussnutzerEndkundeId: 'endkunde-1', systemEndkundeId: 'anderer-endkunde' });

    await expect(service.anlegen(gueltigDto)).rejects.toBeInstanceOf(ProblemDetailsException);
  });
});
