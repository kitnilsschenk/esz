import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DeviceProvisioningService } from './device-provisioning.service';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import { ensureNoOpTransactionHost } from '../test-support/init-noop-transaction-host';
import type { EnergyZaehlerRepository, Zaehler } from '../persistence/energy/energy-zaehler.repository';
import type { DeviceGeraetZuordnungRepository, GeraetZuordnung } from '../persistence/device/device-geraet-zuordnung.repository';
import type { DeviceSchluesselRepository } from '../persistence/device/device-schluessel.repository';
import type { KeyManagementPort } from '../../common/crypto/key-management.port';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import type { BlindIndexService } from '../../common/crypto/blind-index.service';

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

function zuordnung(overrides: Partial<GeraetZuordnung> = {}): GeraetZuordnung {
  return {
    id: 'zuordnung-1',
    zaehlerId: 'zaehler-1',
    cryptoKeyId: 'crypto-1',
    deveuiEnc: Buffer.from('chiffrat'),
    deveuiBlindIndex: Buffer.from('blindindex'),
    pepperVersion: 1,
    status: 'aktiv',
    gueltigVon: '2026-07-01T00:00:00.000Z',
    gueltigBis: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const dek = Buffer.alloc(32, 9);
const fieldCipher = new FieldCipherService();

function createService(overrides: {
  readonly zaehler?: Zaehler | undefined;
  readonly aktiveZuordnung?: GeraetZuordnung | undefined;
  readonly geraetZuordnung?: GeraetZuordnung | undefined;
  readonly insertError?: Error;
}): {
  service: DeviceProvisioningService;
  generateDataKey: ReturnType<typeof vi.fn>;
  blindIndexBerechne: ReturnType<typeof vi.fn>;
  schluesselInsert: ReturnType<typeof vi.fn>;
  geraetZuordnungInsert: ReturnType<typeof vi.fn>;
  deaktivieren: ReturnType<typeof vi.fn>;
} {
  const zaehlerRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.zaehler)),
  } as unknown as EnergyZaehlerRepository;

  const geraetZuordnungInsert = vi.fn(
    (input: { id: string; zaehlerId: string; cryptoKeyId: string; deveuiEnc: Buffer; deveuiBlindIndex: Buffer; pepperVersion: number }) => {
      if (overrides.insertError !== undefined) {
        return Promise.reject(overrides.insertError);
      }
      return Promise.resolve(zuordnung({ ...input }));
    },
  );
  const deaktivieren = vi.fn(() =>
    Promise.resolve(
      overrides.geraetZuordnung === undefined
        ? undefined
        : { ...overrides.geraetZuordnung, status: 'inaktiv' as const, gueltigBis: '2026-07-16T00:00:00.000Z' },
    ),
  );
  const geraetZuordnungRepo = {
    findAktivByZaehlerId: vi.fn(() => Promise.resolve(overrides.aktiveZuordnung)),
    findById: vi.fn(() => Promise.resolve(overrides.geraetZuordnung)),
    insert: geraetZuordnungInsert,
    deaktivieren,
  } as unknown as DeviceGeraetZuordnungRepository;

  const schluesselInsert = vi.fn(() =>
    Promise.resolve({
      id: 'crypto-1',
      wrappedDek: Buffer.from('wrapped'),
      kmsKeyId: 'dev-local:v1',
      algVersion: 1,
      keyState: 'aktiv' as const,
      createdAt: '2026-07-01T00:00:00.000Z',
      geschreddertAt: null,
    }),
  );
  const schluesselRepo = { insert: schluesselInsert } as unknown as DeviceSchluesselRepository;

  const generateDataKey = vi.fn(() =>
    Promise.resolve({ dek, wrappedDek: Buffer.from('wrapped'), kmsKeyId: 'dev-local:v1', algVersion: 1 }),
  );
  const kms: KeyManagementPort = { generateDataKey, unwrapDek: vi.fn() };

  const blindIndexBerechne = vi.fn(() => Promise.resolve({ blindIndex: Buffer.from('blindindex'), pepperVersion: 1 }));
  const blindIndexService = { berechne: blindIndexBerechne } as unknown as BlindIndexService;

  const service = new DeviceProvisioningService(zaehlerRepo, geraetZuordnungRepo, schluesselRepo, kms, fieldCipher, blindIndexService);

  return { service, generateDataKey, blindIndexBerechne, schluesselInsert, geraetZuordnungInsert, deaktivieren };
}

describe('DeviceProvisioningService (ADR-0005 §26.2/§26.3, O4-Provisioning)', () => {
  beforeAll(() => {
    ensureNoOpTransactionHost();
  });

  describe('anlegen()', () => {
    it('wirft 404, wenn der Zaehler nicht existiert', async () => {
      const { service } = createService({ zaehler: undefined });

      await expect(service.anlegen('unbekannt', { devEui: 'AA:BB:CC:DD:EE:FF:00:11' })).rejects.toBeInstanceOf(
        ProblemDetailsException,
      );
    });

    it('wirft 409, wenn bereits eine aktive Zuordnung fuer diesen Zaehler existiert (Vorab-Check, D-EXCL)', async () => {
      const { service } = createService({ zaehler: zaehler(), aktiveZuordnung: zuordnung() });

      await expect(service.anlegen('zaehler-1', { devEui: 'AA:BB:CC:DD:EE:FF:00:11' })).rejects.toBeInstanceOf(
        ProblemDetailsException,
      );
    });

    it('legt eine Geraete-Zuordnung an: DEK VOR dem Insert generiert, DevEUI verschluesselt + Blind-Index berechnet', async () => {
      const { service, generateDataKey, blindIndexBerechne, schluesselInsert, geraetZuordnungInsert } = createService({
        zaehler: zaehler(),
        aktiveZuordnung: undefined,
      });

      const result = await service.anlegen('zaehler-1', { devEui: 'AA:BB:CC:DD:EE:FF:00:11' });

      expect(result).toMatchObject({ zaehlerId: 'zaehler-1', status: 'aktiv', pepperVersion: 1 });
      // KEIN devEui/deveuiEnc/deveuiBlindIndex im Rueckgabewert (O4 Design-Prinzip 1).
      expect(result).not.toHaveProperty('devEui');
      expect(result).not.toHaveProperty('deveuiEnc');
      expect(result).not.toHaveProperty('deveuiBlindIndex');

      expect(generateDataKey).toHaveBeenCalledTimes(1);
      expect(blindIndexBerechne).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF:00:11');
      expect(schluesselInsert).toHaveBeenCalledTimes(1);
      expect(geraetZuordnungInsert).toHaveBeenCalledTimes(1);

      // Reihenfolge: KMS/Blind-Index (Krypto-Vorbereitung) VOR den DB-Inserts.
      expect(generateDataKey.mock.invocationCallOrder[0]).toBeLessThan(schluesselInsert.mock.invocationCallOrder[0] ?? Infinity);
      expect(blindIndexBerechne.mock.invocationCallOrder[0]).toBeLessThan(geraetZuordnungInsert.mock.invocationCallOrder[0] ?? Infinity);
    });

    it('verschluesselt die DevEUI mit AAD=zaehlerId||"deveui" (Decrypt-Roundtrip bestaetigt AAD-Bindung)', async () => {
      const { service, geraetZuordnungInsert } = createService({ zaehler: zaehler(), aktiveZuordnung: undefined });

      await service.anlegen('zaehler-1', { devEui: 'AA:BB:CC:DD:EE:FF:00:11' });

      const insertedInput = geraetZuordnungInsert.mock.calls[0]?.[0] as { deveuiEnc: Buffer };
      const decrypted = fieldCipher.decrypt(dek, 'zaehler-1', 'deveui', insertedInput.deveuiEnc);
      expect(decrypted).toBe('AA:BB:CC:DD:EE:FF:00:11');

      // Falsche AAD (falsche zaehlerId) darf NICHT entschluesseln (GCM-Auth-Tag-Mismatch).
      expect(() => fieldCipher.decrypt(dek, 'falscher-zaehler', 'deveui', insertedInput.deveuiEnc)).toThrow();
    });

    it('uebersetzt eine EXCLUDE-Constraint-Verletzung (D-EXCL) in 409 Konflikt', async () => {
      const pgError = Object.assign(new Error('conflicting key value violates exclusion constraint'), { code: '23P01' });
      const { service } = createService({ zaehler: zaehler(), aktiveZuordnung: undefined, insertError: pgError });

      await expect(service.anlegen('zaehler-1', { devEui: 'AA:BB:CC:DD:EE:FF:00:11' })).rejects.toBeInstanceOf(
        ProblemDetailsException,
      );
    });

    it('uebersetzt eine UNIQUE-Verletzung (partieller Blind-Index-Index) in 409 Konflikt', async () => {
      const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
      const { service } = createService({ zaehler: zaehler(), aktiveZuordnung: undefined, insertError: pgError });

      await expect(service.anlegen('zaehler-1', { devEui: 'AA:BB:CC:DD:EE:FF:00:11' })).rejects.toBeInstanceOf(
        ProblemDetailsException,
      );
    });

    it('reicht einen unbekannten DB-Fehler unveraendert durch', async () => {
      const anderweitigerFehler = new Error('unerwarteter Fehler');
      const { service } = createService({ zaehler: zaehler(), aktiveZuordnung: undefined, insertError: anderweitigerFehler });

      await expect(service.anlegen('zaehler-1', { devEui: 'AA:BB:CC:DD:EE:FF:00:11' })).rejects.toThrow('unerwarteter Fehler');
    });
  });

  describe('aendern()', () => {
    it('wirft 404, wenn die Zuordnung nicht existiert', async () => {
      const { service } = createService({ geraetZuordnung: undefined });

      await expect(service.aendern('unbekannt', { aktion: 'deaktivieren' })).rejects.toBeInstanceOf(ProblemDetailsException);
    });

    it('wirft 409, wenn die Zuordnung bereits krypto-geschreddert ist', async () => {
      const { service } = createService({ geraetZuordnung: zuordnung({ status: 'geschreddert' }) });

      await expect(service.aendern('zuordnung-1', { aktion: 'deaktivieren' })).rejects.toBeInstanceOf(ProblemDetailsException);
    });

    it('deaktiviert eine aktive Zuordnung (status=inaktiv)', async () => {
      const { service, deaktivieren } = createService({ geraetZuordnung: zuordnung() });

      const result = await service.aendern('zuordnung-1', { aktion: 'deaktivieren' });

      expect(result.status).toBe('inaktiv');
      expect(deaktivieren).toHaveBeenCalledWith('zuordnung-1');
    });
  });
});
