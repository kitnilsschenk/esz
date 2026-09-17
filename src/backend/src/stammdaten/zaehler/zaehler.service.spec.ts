import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ZaehlerService } from './zaehler.service';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import type { EnergyZaehlerRepository, Zaehler } from '../persistence/energy/energy-zaehler.repository';
import type { EnergySystemRepository, System } from '../persistence/energy/energy-system.repository';
import type { DeviceGeraetZuordnungRepository, GeraetZuordnung } from '../persistence/device/device-geraet-zuordnung.repository';

/**
 * Unit-Tests (Repo-Fakes, KEIN echter DB-Zugriff, Muster
 * `endkunde.service.spec.ts`) für `ZaehlerService` — schließt die
 * Merge-Blocker-Lücke aus dem Phase-4-Review (`.claude/rules/tests.md`).
 * Deckt insbesondere die idempotente Stilllegung ab (Linie 3, kein
 * Hard-Delete).
 */

function system(overrides: Partial<System> = {}): System {
  return {
    id: 'system-1',
    endkundeId: 'endkunde-1',
    bezeichnung: 'Testsystem',
    systemgrenze: 'Gebaeude A',
    systembeschreibung: null,
    standortId: null,
    status: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function zaehler(overrides: Partial<Zaehler> = {}): Zaehler {
  return {
    id: 'zaehler-1',
    systemId: 'system-1',
    geraetetyp: 'Testgeraet Modell X',
    energietraeger: 'strom',
    status: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function geraetZuordnung(overrides: Partial<GeraetZuordnung> = {}): GeraetZuordnung {
  return {
    id: 'zuordnung-1',
    zaehlerId: 'zaehler-1',
    cryptoKeyId: 'key-1',
    deveuiEnc: Buffer.from('verschluesselt'),
    deveuiBlindIndex: Buffer.from('blindindex'),
    pepperVersion: 1,
    status: 'aktiv',
    gueltigVon: '2026-03-12T10:00:00.000Z',
    gueltigBis: null,
    createdAt: '2026-03-12T10:00:00.000Z',
    updatedAt: '2026-03-12T10:00:00.000Z',
    ...overrides,
  };
}

function createService(overrides: {
  readonly zaehler?: Zaehler | undefined;
  readonly system?: System | undefined;
  /** Aktive Geraete-Zuordnung des Zaehlers (ADR-0011 D7); `undefined` = keine. */
  readonly anbindung?: GeraetZuordnung | undefined;
}): { service: ZaehlerService; zaehlerRepo: EnergyZaehlerRepository } {
  const zaehlerRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.zaehler)),
    listPage: vi.fn(() => Promise.resolve([])),
    insert: vi.fn((input: { id: string; systemId: string; geraetetyp: string; energietraeger: Zaehler['energietraeger'] }) =>
      Promise.resolve(zaehler({ ...input })),
    ),
    updateGeraetetyp: vi.fn((_id: string, geraetetyp: string) =>
      Promise.resolve(overrides.zaehler === undefined ? undefined : { ...overrides.zaehler, geraetetyp }),
    ),
    stilllegen: vi.fn(() =>
      Promise.resolve(overrides.zaehler === undefined ? undefined : { ...overrides.zaehler, status: 'stillgelegt' as const }),
    ),
  } as unknown as EnergyZaehlerRepository;

  const systemRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.system)),
  } as unknown as EnergySystemRepository;

  const geraetZuordnungRepo = {
    findAktivByZaehlerId: vi.fn(() => Promise.resolve(overrides.anbindung)),
  } as unknown as DeviceGeraetZuordnungRepository;

  return { service: new ZaehlerService(zaehlerRepo, systemRepo, geraetZuordnungRepo), zaehlerRepo };
}

describe('ZaehlerService (ADR-0008 §12/§20)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('anlegen(): legt einen Zaehler an, wenn das referenzierte System existiert', async () => {
    const { service } = createService({ system: system() });

    const result = await service.anlegen({ systemId: 'system-1', geraetetyp: 'Testgeraet Modell X', energietraeger: 'strom' });

    expect(result).toMatchObject({ systemId: 'system-1', energietraeger: 'strom', status: 'aktiv' });
  });

  it('anlegen(): wirft 404, wenn das referenzierte System nicht existiert', async () => {
    const { service } = createService({ system: undefined });

    await expect(
      service.anlegen({ systemId: 'unbekannt', geraetetyp: 'Testgeraet', energietraeger: 'strom' }),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('detail(): wirft 404, wenn der Zaehler nicht existiert', async () => {
    const { service } = createService({ zaehler: undefined });

    await expect(service.detail('unbekannt')).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('detail(): liefert den gemappten Zaehler, wenn er existiert', async () => {
    const { service } = createService({ zaehler: zaehler() });

    const result = await service.detail('zaehler-1');

    expect(result).toMatchObject({ id: 'zaehler-1', energietraeger: 'strom', status: 'aktiv' });
  });

  it('aendern(): wirft 400, wenn geraetetyp nicht gesetzt ist (minProperties:1)', async () => {
    const { service } = createService({ zaehler: zaehler() });

    await expect(service.aendern('zaehler-1', {})).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('aendern(): wirft 404, wenn der Zaehler nicht existiert', async () => {
    const { service } = createService({ zaehler: undefined });

    await expect(service.aendern('unbekannt', { geraetetyp: 'Neues Geraet' })).rejects.toBeInstanceOf(
      ProblemDetailsException,
    );
  });

  it('aendern(): aktualisiert geraetetyp, wenn der Zaehler existiert', async () => {
    const { service } = createService({ zaehler: zaehler() });

    const result = await service.aendern('zaehler-1', { geraetetyp: 'Neues Geraet' });

    expect(result.geraetetyp).toBe('Neues Geraet');
  });

  it('stilllegen(): wirft 404, wenn der Zaehler nicht existiert', async () => {
    const { service } = createService({ zaehler: undefined });

    await expect(service.stilllegen('unbekannt')).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('stilllegen(): setzt den Status auf stillgelegt (kein Hard-Delete, Linie 3)', async () => {
    const { service } = createService({ zaehler: zaehler() });

    const result = await service.stilllegen('zaehler-1');

    expect(result.status).toBe('stillgelegt');
  });

  it('stilllegen(): ist idempotent (zweiter Aufruf auf bereits stillgelegtem Zaehler liefert denselben Erfolg)', async () => {
    const { service } = createService({ zaehler: zaehler({ status: 'stillgelegt' }) });

    const result = await service.stilllegen('zaehler-1');

    expect(result.status).toBe('stillgelegt');
  });
});

describe('ZaehlerService — Geraete-Anbindung am Detail (ADR-0011 D7)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('weist die aktive Geraete-Zuordnung am Zaehler-Detail aus', async () => {
    const { service } = createService({ zaehler: zaehler(), anbindung: geraetZuordnung() });

    const result = await service.detail('zaehler-1');

    expect(result.geraetAnbindung).toEqual({
      id: 'zuordnung-1',
      status: 'aktiv',
      gueltigVon: '2026-03-12T10:00:00.000Z',
      gueltigBis: null,
      pepperVersion: 1,
    });
  });

  it('gibt WEDER DevEUI noch Blind-Index heraus', async () => {
    // Der Anzeige-Ausschnitt ist der einzige Weg, auf dem eine Zuordnung
    // ausserhalb der break-glass-Reverse-Aufloesung sichtbar wird. Was hier
    // durchrutscht, steht anschliessend in jeder Zaehler-Antwort.
    const { service } = createService({ zaehler: zaehler(), anbindung: geraetZuordnung() });

    const result = await service.detail('zaehler-1');
    const serialisiert = JSON.stringify(result);

    expect(serialisiert).not.toContain('deveui');
    expect(serialisiert).not.toContain('blindIndex');
    expect(serialisiert).not.toContain('cryptoKeyId');
    expect(Object.keys(result.geraetAnbindung ?? {})).toEqual([
      'id',
      'status',
      'gueltigVon',
      'gueltigBis',
      'pepperVersion',
    ]);
  });

  it('liefert null, wenn keine aktive Zuordnung besteht', async () => {
    const { service } = createService({ zaehler: zaehler() });

    await expect(service.detail('zaehler-1')).resolves.toMatchObject({ geraetAnbindung: null });
  });

  it('meldet fuer einen frisch angelegten Zaehler keine Anbindung', async () => {
    const { service } = createService({ system: system() });

    const result = await service.anlegen({ systemId: 'system-1', geraetetyp: 'Testgeraet Modell X', energietraeger: 'strom' });

    expect(result.geraetAnbindung).toBeNull();
  });

  it('weist die Anbindung auch nach dem Stilllegen weiter aus', async () => {
    // Das Stilllegen beendet die Zuordnung heute NICHT (ADR-0011 O6). Solange
    // das so ist, muss die Antwort den Zustand zeigen statt ihn zu verschweigen.
    const { service } = createService({ zaehler: zaehler(), anbindung: geraetZuordnung() });

    const result = await service.stilllegen('zaehler-1');

    expect(result.status).toBe('stillgelegt');
    expect(result.geraetAnbindung?.status).toBe('aktiv');
  });
});
