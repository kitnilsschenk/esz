import { describe, expect, it, vi } from 'vitest';
import { DeviceReverseAufloesungService } from './device-reverse-aufloesung.service';
import { ProblemDetailsException } from '../../common/exceptions/problem-details.exception';
import type { DeviceGeraetZuordnungRepository, GeraetZuordnung } from '../persistence/device/device-geraet-zuordnung.repository';
import type { DeviceSchluessel, DeviceSchluesselRepository } from '../persistence/device/device-schluessel.repository';
import type { KeyManagementPort } from '../../common/crypto/key-management.port';
import { FieldCipherService } from '../../common/crypto/field-cipher.service';
import type { AlertPort } from './geraet-reverse-alert.port';
import type { SecurityContext } from '../../common/security/security-context';

const dek = Buffer.alloc(32, 5);
const fieldCipher = new FieldCipherService();
const devEuiKlartext = 'AABBCCDDEEFF0011';

function schluessel(overrides: Partial<DeviceSchluessel> = {}): DeviceSchluessel {
  return {
    id: 'crypto-1',
    wrappedDek: Buffer.from('wrapped'),
    kmsKeyId: 'dev-local:v1',
    algVersion: 1,
    keyState: 'aktiv',
    createdAt: '2026-07-01T00:00:00.000Z',
    geschreddertAt: null,
    ...overrides,
  };
}

function zuordnung(overrides: Partial<GeraetZuordnung> = {}): GeraetZuordnung {
  return {
    id: 'zuordnung-1',
    zaehlerId: 'zaehler-1',
    cryptoKeyId: 'crypto-1',
    deveuiEnc: fieldCipher.encrypt(dek, 'zaehler-1', 'deveui', devEuiKlartext),
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

function subject(): SecurityContext {
  return { sub: 'support-sub', actorTyp: 'benutzer', roles: ['geraete-support'], azp: 'edms-bff' };
}

function createService(overrides: {
  readonly zuordnung?: GeraetZuordnung | undefined;
  readonly schluessel?: DeviceSchluessel | undefined;
}): { service: DeviceReverseAufloesungService; alertEmit: ReturnType<typeof vi.fn> } {
  const geraetZuordnungRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.zuordnung)),
  } as unknown as DeviceGeraetZuordnungRepository;

  const schluesselRepo = {
    findById: vi.fn(() => Promise.resolve(overrides.schluessel)),
  } as unknown as DeviceSchluesselRepository;

  const kms: KeyManagementPort = {
    generateDataKey: vi.fn(),
    unwrapDek: vi.fn(() => Promise.resolve(dek)),
  };

  const alertEmit = vi.fn(() => Promise.resolve());
  const alertPort: AlertPort = { emit: alertEmit };

  const service = new DeviceReverseAufloesungService(geraetZuordnungRepo, schluesselRepo, kms, fieldCipher, alertPort);
  return { service, alertEmit };
}

describe('DeviceReverseAufloesungService (ADR-0005 §26.4 SEC-5, Reverse-Aufloesung)', () => {
  it('entschluesselt die DevEUI korrekt (AAD=zaehlerId||"deveui") und liefert sie im Klartext zurueck', async () => {
    const { service } = createService({ zuordnung: zuordnung(), schluessel: schluessel() });

    const result = await service.reverseAufloesen('zuordnung-1', { zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-1' }, subject());

    expect(result).toEqual({ id: 'zuordnung-1', zaehlerId: 'zaehler-1', devEui: devEuiKlartext });
  });

  it('feuert den Alert bei erfolgreicher Aufloesung, Inhalt EXAKT die whitelisted Felder (RL-2: KEIN devEui/Blind-Index)', async () => {
    const { service, alertEmit } = createService({ zuordnung: zuordnung(), schluessel: schluessel() });

    await service.reverseAufloesen('zuordnung-1', { zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-1' }, subject());

    expect(alertEmit).toHaveBeenCalledTimes(1);
    const payload = alertEmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['actorSub', 'ticketRef', 'zaehlerId', 'zeitpunkt', 'zweck']);
    expect(payload['actorSub']).toBe('support-sub');
    expect(payload['zaehlerId']).toBe('zaehler-1');
    expect(payload['zweck']).toBe('geraete_stoerungsdiagnose');
    expect(payload['ticketRef']).toBe('HD-1');
    expect(JSON.stringify(payload)).not.toContain(devEuiKlartext);
  });

  it('wirft 404, wenn die Geraete-Zuordnung nicht existiert', async () => {
    const { service } = createService({ zuordnung: undefined });

    await expect(
      service.reverseAufloesen('unbekannt', { zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-1' }, subject()),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('wirft 409, wenn die Zuordnung bereits krypto-geschreddert ist (Art. 17)', async () => {
    const { service } = createService({ zuordnung: zuordnung({ status: 'geschreddert' }), schluessel: schluessel({ keyState: 'geschreddert' }) });

    await expect(
      service.reverseAufloesen('zuordnung-1', { zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-1' }, subject()),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('wirft 409, wenn der zugehoerige Schluessel nicht mehr existiert (Datenintegritaet)', async () => {
    const { service } = createService({ zuordnung: zuordnung(), schluessel: undefined });

    await expect(
      service.reverseAufloesen('zuordnung-1', { zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-1' }, subject()),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });

  it('wirft 409, wenn der Schluessel bereits geschreddert ist, obwohl die Zuordnung selbst (fehlerhaft) noch aktiv waere', async () => {
    const { service } = createService({ zuordnung: zuordnung(), schluessel: schluessel({ keyState: 'geschreddert' }) });

    await expect(
      service.reverseAufloesen('zuordnung-1', { zweck: 'geraete_stoerungsdiagnose', ticketRef: 'HD-1' }, subject()),
    ).rejects.toBeInstanceOf(ProblemDetailsException);
  });
});
