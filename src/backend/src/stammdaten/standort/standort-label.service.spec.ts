import { beforeAll, describe, expect, it, vi } from 'vitest';
import { StandortLabelService } from './standort-label.service';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import type { KeyManagementPort } from '../../common/crypto/key-management.port';
import type { EnergyStandortRepository, Standort } from '../persistence/energy/energy-standort.repository';
import type { IdentityStandortPiiRepository, StandortPii } from '../persistence/identity/identity-standort-pii.repository';
import type { EndkundePii, IdentityEndkundePiiRepository } from '../persistence/identity/identity-endkunde-pii.repository';
import type {
  IdentitySubjektSchluesselRepository,
  SubjektSchluessel,
} from '../persistence/identity/identity-subjekt-schluessel.repository';

const dek = Buffer.alloc(32, 3);
const fieldCipher = new FieldCipherService();

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

function endkundePii(overrides: Partial<EndkundePii> = {}): EndkundePii {
  return {
    id: 'endkunde-pii-1',
    pseudonymId: 'endkunde-1',
    cryptoKeyId: 'endkunden-dek-1',
    nameEnc: Buffer.from('irrelevant'),
    anschriftEnc: Buffer.from('irrelevant'),
    kontaktEnc: null,
    piiStatus: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function subjektSchluessel(overrides: Partial<SubjektSchluessel> = {}): SubjektSchluessel {
  return {
    id: 'endkunden-dek-1',
    wrappedDek: Buffer.from('wrapped'),
    kmsKeyId: 'dev-local:v1',
    algVersion: 1,
    keyState: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    geschreddertAt: null,
    ...overrides,
  };
}

function createService(overrides: {
  standorte?: readonly Standort[];
  piiRows?: readonly StandortPii[];
  endkundePii?: EndkundePii | undefined;
  subjektSchluessel?: SubjektSchluessel | undefined;
}): StandortLabelService {
  const standortRepo = {
    findManyByIdsAndEndkunde: vi.fn(() => Promise.resolve(overrides.standorte ?? [])),
  } as unknown as EnergyStandortRepository;

  const standortPiiRepo = {
    findManyByPseudonymIds: vi.fn(() => Promise.resolve(overrides.piiRows ?? [])),
  } as unknown as IdentityStandortPiiRepository;

  const endkundePiiRepo = {
    findByPseudonymId: vi.fn(() => Promise.resolve(overrides.endkundePii)),
  } as unknown as IdentityEndkundePiiRepository;

  const subjektSchluesselRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.subjektSchluessel)),
  } as unknown as IdentitySubjektSchluesselRepository;

  const kms: KeyManagementPort = {
    generateDataKey: vi.fn(() =>
      Promise.resolve({ dek, wrappedDek: Buffer.from('wrapped'), kmsKeyId: 'dev-local:v1', algVersion: 1 }),
    ),
    unwrapDek: vi.fn(() => Promise.resolve(dek)),
  };

  return new StandortLabelService(standortRepo, standortPiiRepo, endkundePiiRepo, subjektSchluesselRepo, kms, fieldCipher);
}

describe('StandortLabelService (ADR-0010 D5) — labels() (read:standort_pii)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  it('entschluesselt bezeichnung/anschrift korrekt fuer die richtige standortId (AAD-Bindung)', async () => {
    const bezeichnungEnc = fieldCipher.encrypt(dek, 'standort-1', 'bezeichnung', 'Wohnung 3');
    const anschriftEnc = fieldCipher.encrypt(dek, 'standort-1', 'anschrift', 'Musterstr. 1');

    const service = createService({
      standorte: [standort({ id: 'standort-1' })],
      piiRows: [
        {
          id: 'pii-1',
          pseudonymId: 'standort-1',
          cryptoKeyId: 'endkunden-dek-1',
          bezeichnungEnc,
          anschriftEnc,
          geoEnc: null,
          piiStatus: 'aktiv',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      endkundePii: endkundePii(),
      subjektSchluessel: subjektSchluessel(),
    });

    const result = await service.labels('endkunde-1', ['standort-1']);

    expect(result).toEqual([{ id: 'standort-1', bezeichnung: 'Wohnung 3', anschrift: 'Musterstr. 1' }]);
  });

  it('AAD-Bindung: ein Chiffrat, das fuer EINEN ANDEREN Standort desselben Endkunden verschluesselt wurde, laesst sich NICHT unter der falschen standortId entschluesseln', () => {
    const bezeichnungEncFuerStandortA = fieldCipher.encrypt(dek, 'standort-A', 'bezeichnung', 'Wohnung 3');

    // Ein Angreifer/Bug, der dasselbe Chiffrat unter einer ANDEREN standortId
    // (aber demselben, geteilten Endkunden-DEK) zu entschluesseln versucht,
    // MUSS an der AAD scheitern (GCM-Auth-Tag-Mismatch) — genau das ist die
    // zentrale Sicherheitsauflage aus ADR-0010 D4.
    expect(() => fieldCipher.decrypt(dek, 'standort-B', 'bezeichnung', bezeichnungEncFuerStandortA)).toThrow();
  });

  it('EIN Batch-Aufruf entschluesselt ALLE angeforderten Standorte MIT NUR EINEM DEK-Unwrap (gemeinsamer Endkunden-DEK)', async () => {
    const bezeichnungEncA = fieldCipher.encrypt(dek, 'standort-A', 'bezeichnung', 'Wohnung A');
    const bezeichnungEncB = fieldCipher.encrypt(dek, 'standort-B', 'bezeichnung', 'Wohnung B');

    const kms: KeyManagementPort = {
      generateDataKey: vi.fn(() =>
        Promise.resolve({ dek, wrappedDek: Buffer.from('wrapped'), kmsKeyId: 'dev-local:v1', algVersion: 1 }),
      ),
      unwrapDek: vi.fn(() => Promise.resolve(dek)),
    };

    const standortRepo = {
      findManyByIdsAndEndkunde: vi.fn(() =>
        Promise.resolve([standort({ id: 'standort-A' }), standort({ id: 'standort-B' })]),
      ),
    } as unknown as EnergyStandortRepository;
    const standortPiiRepo = {
      findManyByPseudonymIds: vi.fn(() =>
        Promise.resolve([
          {
            id: 'pii-A',
            pseudonymId: 'standort-A',
            cryptoKeyId: 'endkunden-dek-1',
            bezeichnungEnc: bezeichnungEncA,
            anschriftEnc: null,
            geoEnc: null,
            piiStatus: 'aktiv' as const,
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
          {
            id: 'pii-B',
            pseudonymId: 'standort-B',
            cryptoKeyId: 'endkunden-dek-1',
            bezeichnungEnc: bezeichnungEncB,
            anschriftEnc: null,
            geoEnc: null,
            piiStatus: 'aktiv' as const,
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ]),
      ),
    } as unknown as IdentityStandortPiiRepository;
    const endkundePiiRepo = {
      findByPseudonymId: vi.fn(() => Promise.resolve(endkundePii())),
    } as unknown as IdentityEndkundePiiRepository;
    const subjektSchluesselRepo = {
      findById: vi.fn(() => Promise.resolve(subjektSchluessel())),
    } as unknown as IdentitySubjektSchluesselRepository;

    const service = new StandortLabelService(standortRepo, standortPiiRepo, endkundePiiRepo, subjektSchluesselRepo, kms, fieldCipher);

    const result = await service.labels('endkunde-1', ['standort-A', 'standort-B']);

    expect(kms.unwrapDek).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { id: 'standort-A', bezeichnung: 'Wohnung A', anschrift: null },
      { id: 'standort-B', bezeichnung: 'Wohnung B', anschrift: null },
    ]);
  });

  it('leere Liste, wenn der Endkunde bereits krypto-geschreddert ist (keine PII mehr entschluesselbar, kein Fehler)', async () => {
    const service = createService({
      standorte: [standort({ id: 'standort-1' })],
      endkundePii: endkundePii(),
      subjektSchluessel: subjektSchluessel({ keyState: 'geschreddert' }),
    });

    const result = await service.labels('endkunde-1', ['standort-1']);

    expect(result).toEqual([]);
  });

  it('leere Liste, wenn keiner der angeforderten Standorte zum angegebenen Endkunden gehoert (Mandantentreue, silently gefiltert)', async () => {
    const service = createService({ standorte: [] });

    const result = await service.labels('endkunde-1', ['standort-fremd']);

    expect(result).toEqual([]);
  });

  it('leere Liste (KEIN 404), wenn identity.endkunde_pii bereits neutralisiert ist (Krypto-Shredding, ADR-0010 D4) — energy.standort existiert noch', async () => {
    const service = createService({
      standorte: [standort({ id: 'standort-1' })],
      endkundePii: undefined,
    });

    const result = await service.labels('endkunde-1', ['standort-1']);

    expect(result).toEqual([]);
  });
});
