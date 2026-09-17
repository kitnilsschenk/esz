import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MesskanalService } from './messkanal.service';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import type { EnergyMesskanalRepository, Messkanal } from '../persistence/energy/energy-messkanal.repository';
import type { EnergyZaehlerRepository, Zaehler } from '../persistence/energy/energy-zaehler.repository';

/**
 * Unit-Tests (Repo-Fakes, KEIN echter DB-Zugriff, Muster
 * `endkunde.service.spec.ts`) für `MesskanalService` — schließt die
 * Merge-Blocker-Lücke aus dem Phase-4-Review (`.claude/rules/tests.md`).
 * Deckt insbesondere die 409-Konflikt-Übersetzung (UNIQUE-Verletzung ->
 * `konflikt()`) sowie die idempotente Stilllegung ab.
 */

function zaehler(overrides: Partial<Zaehler> = {}): Zaehler {
  return {
    id: 'zaehler-1',
    systemId: 'system-1',
    geraetetyp: 'Testgeraet',
    energietraeger: 'strom',
    status: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

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
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function createService(overrides: {
  readonly messkanal?: Messkanal | undefined;
  readonly zaehler?: Zaehler | undefined;
  // `Error` statt `unknown` (`@typescript-eslint/prefer-promise-reject-errors`
  // verlangt eine statisch als `Error` typisierte Reject-Reason) — spiegelt
  // zudem die Realitaet: TypeORMs `QueryFailedError` (die reale Fehlerklasse
  // im Produktpfad, `pg-error.util.ts`) erweitert ebenfalls `Error`.
  readonly insertError?: Error;
}): { service: MesskanalService; messkanalRepo: EnergyMesskanalRepository } {
  const messkanalRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.messkanal)),
    listPage: vi.fn(() => Promise.resolve([])),
    insert: vi.fn((input: { id: string; zaehlerId: string; messgroesse: string; einheit: string; art: Messkanal['art']; obisKennzahl: string | null }) => {
      if (overrides.insertError !== undefined) {
        return Promise.reject(overrides.insertError);
      }
      return Promise.resolve(messkanal({ ...input }));
    }),
    update: vi.fn((_id: string, input: { einheit?: string; obisKennzahl?: string | null }) =>
      Promise.resolve(
        overrides.messkanal === undefined
          ? undefined
          : {
              ...overrides.messkanal,
              ...(input.einheit !== undefined ? { einheit: input.einheit } : {}),
              ...(input.obisKennzahl !== undefined ? { obisKennzahl: input.obisKennzahl } : {}),
            },
      ),
    ),
    stilllegen: vi.fn(() =>
      Promise.resolve(
        overrides.messkanal === undefined ? undefined : { ...overrides.messkanal, status: 'stillgelegt' as const },
      ),
    ),
  } as unknown as EnergyMesskanalRepository;

  const zaehlerRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.zaehler)),
  } as unknown as EnergyZaehlerRepository;

  return { service: new MesskanalService(messkanalRepo, zaehlerRepo), messkanalRepo };
}

describe('MesskanalService (ADR-0008 §12/§20)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('liste(): wirft 404, wenn der Zaehler nicht existiert', async () => {
    const { service } = createService({ zaehler: undefined });

    await expect(service.liste('unbekannt', { limit: 50 })).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('anlegen(): legt einen Messkanal an, wenn der referenzierte Zaehler existiert', async () => {
    const { service } = createService({ zaehler: zaehler() });

    const result = await service.anlegen('zaehler-1', { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });

    expect(result).toMatchObject({ zaehlerId: 'zaehler-1', messgroesse: 'wirkarbeit', status: 'aktiv' });
  });

  it('anlegen(): wirft 404, wenn der referenzierte Zaehler nicht existiert', async () => {
    const { service } = createService({ zaehler: undefined });

    await expect(
      service.anlegen('unbekannt', { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' }),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('anlegen(): uebersetzt eine UNIQUE-Verletzung (Zaehler/Messgroesse/OBIS-Kennzahl) in 409 Konflikt', async () => {
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
    const { service } = createService({ zaehler: zaehler(), insertError: pgError });

    let caught: unknown;
    try {
      await service.anlegen('zaehler-1', { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProblemDetailsException);
    expect((caught as ProblemDetailsException).getStatus()).toBe(409);
  });

  it('anlegen(): reicht einen unbekannten DB-Fehler unveraendert durch (kein PG_UNIQUE_VIOLATION)', async () => {
    const anderweitigerFehler = new Error('unerwarteter Fehler');
    const { service } = createService({ zaehler: zaehler(), insertError: anderweitigerFehler });

    await expect(
      service.anlegen('zaehler-1', { messgroesse: 'wirkarbeit', einheit: 'kWh', art: 'kumulativ_zaehlerstand' }),
    ).rejects.toThrow('unerwarteter Fehler');
  });

  it('detail(): wirft 404, wenn der Messkanal nicht existiert', async () => {
    const { service } = createService({ messkanal: undefined });

    await expect(service.detail('unbekannt')).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('detail(): liefert den gemappten Messkanal, wenn er existiert', async () => {
    const { service } = createService({ messkanal: messkanal() });

    const result = await service.detail('messkanal-1');

    expect(result).toMatchObject({ id: 'messkanal-1', messgroesse: 'wirkarbeit', status: 'aktiv' });
  });

  it('aendern(): wirft 400, wenn weder einheit noch obisKennzahl gesetzt sind (minProperties:1)', async () => {
    const { service } = createService({ messkanal: messkanal() });

    await expect(service.aendern('messkanal-1', {})).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('aendern(): wirft 404, wenn der Messkanal nicht existiert', async () => {
    const { service } = createService({ messkanal: undefined });

    await expect(service.aendern('unbekannt', { einheit: 'MWh' })).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('aendern(): aktualisiert die einheit, wenn der Messkanal existiert', async () => {
    const { service } = createService({ messkanal: messkanal() });

    const result = await service.aendern('messkanal-1', { einheit: 'MWh' });

    expect(result.einheit).toBe('MWh');
  });

  it('stilllegen(): wirft 404, wenn der Messkanal nicht existiert', async () => {
    const { service } = createService({ messkanal: undefined });

    await expect(service.stilllegen('unbekannt')).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('stilllegen(): ist idempotent (zweiter Aufruf auf bereits stillgelegtem Messkanal liefert denselben Erfolg)', async () => {
    const { service } = createService({ messkanal: messkanal({ status: 'stillgelegt' }) });

    const result = await service.stilllegen('messkanal-1');

    expect(result.status).toBe('stillgelegt');
  });
});
