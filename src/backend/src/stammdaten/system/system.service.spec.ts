import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SystemService } from './system.service';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import type { EnergySystemRepository, System } from '../persistence/energy/energy-system.repository';
import type { EnergyEndkundeRepository, Endkunde } from '../persistence/energy/energy-endkunde.repository';
import type { EnergyStandortRepository } from '../persistence/energy/energy-standort.repository';

/**
 * Unit-Tests (Repo-Fakes, KEIN echter DB-Zugriff, Muster
 * `endkunde.service.spec.ts`) für `SystemService` — schließt die
 * Merge-Blocker-Lücke aus dem Phase-4-Review (`.claude/rules/tests.md`).
 */

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

function system(overrides: Partial<System> = {}): System {
  return {
    id: 'system-1',
    endkundeId: 'endkunde-1',
    bezeichnung: 'Testsystem Musteranlage',
    systemgrenze: 'Gebaeude A',
    systembeschreibung: null,
    standortId: null,
    status: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function createService(overrides: { readonly system?: System | undefined; readonly endkunde?: Endkunde | undefined }): {
  service: SystemService;
  systemRepo: EnergySystemRepository;
} {
  const systemRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.system)),
    listPage: vi.fn(() => Promise.resolve([])),
    insert: vi.fn((input: { id: string; endkundeId: string; bezeichnung: string; systemgrenze: string; systembeschreibung: string | null }) =>
      Promise.resolve(system({ ...input })),
    ),
    update: vi.fn((_id: string, input: { bezeichnung?: string; systemgrenze?: string; systembeschreibung?: string }) =>
      Promise.resolve(
        overrides.system === undefined
          ? undefined
          : {
              ...overrides.system,
              ...(input.bezeichnung !== undefined ? { bezeichnung: input.bezeichnung } : {}),
              ...(input.systemgrenze !== undefined ? { systemgrenze: input.systemgrenze } : {}),
              ...(input.systembeschreibung !== undefined ? { systembeschreibung: input.systembeschreibung } : {}),
            },
      ),
    ),
    stilllegen: vi.fn(() =>
      Promise.resolve(overrides.system === undefined ? undefined : { ...overrides.system, status: 'stillgelegt' as const }),
    ),
  } as unknown as EnergySystemRepository;

  const endkundeRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.endkunde)),
  } as unknown as EnergyEndkundeRepository;

  // Der Standort-Repo-Doppel liefert immer einen Standort DESSELBEN
  // Endkunden — die Mandantenpruefung selbst hat ihren Integrationstest
  // (`nachweis-felder.integration.spec.ts`), hier geht es um alles andere.
  const standortRepo = {
    findById: vi.fn(() => Promise.resolve({ id: 'standort-1', endkundeId: 'endkunde-1' })),
  } as unknown as EnergyStandortRepository;

  return { service: new SystemService(systemRepo, endkundeRepo, standortRepo), systemRepo };
}

describe('SystemService (ADR-0008 §12/§20 — System = CRU in v1)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('anlegen(): legt ein System an, wenn der referenzierte Endkunde existiert', async () => {
    const { service } = createService({ endkunde: endkunde() });

    const result = await service.anlegen({
      endkundeId: 'endkunde-1',
      bezeichnung: 'Testsystem Musteranlage',
      systemgrenze: 'Gebaeude A',
    });

    expect(result).toMatchObject({ endkundeId: 'endkunde-1', bezeichnung: 'Testsystem Musteranlage' });
  });

  it('anlegen(): wirft 404, wenn der referenzierte Endkunde nicht existiert', async () => {
    const { service } = createService({ endkunde: undefined });

    await expect(
      service.anlegen({ endkundeId: 'unbekannt', bezeichnung: 'Testsystem', systemgrenze: 'Gebaeude A' }),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('detail(): wirft 404, wenn das System nicht existiert', async () => {
    const { service } = createService({ system: undefined, endkunde: endkunde() });

    await expect(service.detail('unbekannt')).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('detail(): liefert das gemappte System, wenn es existiert', async () => {
    const { service } = createService({ system: system(), endkunde: endkunde() });

    const result = await service.detail('system-1');

    expect(result).toMatchObject({ id: 'system-1', bezeichnung: 'Testsystem Musteranlage' });
  });

  it('aendern(): wirft 400, wenn kein Feld gesetzt ist (minProperties:1)', async () => {
    const { service } = createService({ system: system(), endkunde: endkunde() });

    await expect(service.aendern('system-1', {})).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('aendern(): wirft 404, wenn das System nicht existiert', async () => {
    const { service } = createService({ system: undefined, endkunde: endkunde() });

    await expect(service.aendern('unbekannt', { bezeichnung: 'Neuer Name' })).rejects.toBeInstanceOf(
      ProblemDetailsException,
    );
  });

  it('aendern(): aktualisiert die Bezeichnung, wenn das System existiert', async () => {
    const { service } = createService({ system: system(), endkunde: endkunde() });

    const result = await service.aendern('system-1', { bezeichnung: 'Neue Bezeichnung' });

    expect(result.bezeichnung).toBe('Neue Bezeichnung');
  });

  it('stilllegen(): wirft 404, wenn das System nicht existiert', async () => {
    const { service } = createService({ system: undefined, endkunde: endkunde() });

    await expect(service.stilllegen('unbekannt')).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('stilllegen(): setzt den Status auf stillgelegt (kein Hard-Delete, Linie 3)', async () => {
    const { service } = createService({ system: system(), endkunde: endkunde() });

    const result = await service.stilllegen('system-1');

    expect(result.status).toBe('stillgelegt');
  });

  it('stilllegen(): ist idempotent (zweiter Aufruf auf bereits stillgelegtem System liefert denselben Erfolg)', async () => {
    const { service } = createService({ system: system({ status: 'stillgelegt' }), endkunde: endkunde() });

    const result = await service.stilllegen('system-1');

    expect(result.status).toBe('stillgelegt');
  });
});
