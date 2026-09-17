import { describe, expect, it, vi } from 'vitest';
import { DeviceKryptoShreddingService } from './device-krypto-shredding.service';
import type { DeviceSchluesselRepository, DeviceSchluessel } from '../persistence/device/device-schluessel.repository';
import type { DeviceGeraetZuordnungRepository, GeraetZuordnung } from '../persistence/device/device-geraet-zuordnung.repository';
import type { AuditService } from '../../audit/audit.service';
import { STAMMDATEN_EVENT_CODES } from '../audit/stammdaten-audit-events';
import type { SecurityContext } from '../../common/security/security-context';

function schluessel(overrides: Partial<DeviceSchluessel> = {}): DeviceSchluessel {
  return {
    id: 'crypto-1',
    wrappedDek: Buffer.from('wrapped'),
    kmsKeyId: 'dev-local:v1',
    algVersion: 1,
    keyState: 'geschreddert',
    createdAt: '2026-07-01T00:00:00.000Z',
    geschreddertAt: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
}

function zuordnung(overrides: Partial<GeraetZuordnung> = {}): GeraetZuordnung {
  return {
    id: 'zuordnung-1',
    zaehlerId: 'zaehler-1',
    cryptoKeyId: 'crypto-1',
    deveuiEnc: Buffer.from('irrelevant'),
    deveuiBlindIndex: null,
    pepperVersion: 1,
    status: 'geschreddert',
    gueltigVon: '2026-07-01T00:00:00.000Z',
    gueltigBis: '2026-07-16T00:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    ...overrides,
  };
}

function subject(): SecurityContext {
  return { sub: 'betrieb-freigeber-sub', actorTyp: 'benutzer', roles: ['betrieb'], azp: 'edms-bff' };
}

describe('DeviceKryptoShreddingService (ADR-0005 §26.5, Art. 17 — device-Dimension)', () => {
  it('shred(): vernichtet den DEK, nullt den Blind-Index + schliesst die Zuordnung, auditiert mit korrektem Kontext', async () => {
    const markGeschreddert = vi.fn(() => Promise.resolve(schluessel()));
    const schluesselRepo = { markGeschreddert } as unknown as DeviceSchluesselRepository;

    const markGeschreddertByCryptoKeyId = vi.fn(() => Promise.resolve(zuordnung()));
    const geraetZuordnungRepo = { markGeschreddertByCryptoKeyId } as unknown as DeviceGeraetZuordnungRepository;

    const append = vi.fn(() =>
      Promise.resolve({
        eventId: 'evt-1',
        lane: 0,
        tagUtc: '2026-07-16',
        seq: '1',
        ts: '2026-07-16T00:00:00.000Z',
        eventTyp: STAMMDATEN_EVENT_CODES.GERAET_ZUORDNUNG_GESCHREDDERT,
        ergebnis: 'ok' as const,
      }),
    );
    const auditService = { append } as unknown as AuditService;

    const service = new DeviceKryptoShreddingService(schluesselRepo, geraetZuordnungRepo, auditService);

    const result = await service.shred({
      cryptoKeyId: 'crypto-1',
      zaehlerId: 'zaehler-1',
      antragId: 'antrag-1',
      subject: subject(),
    });

    expect(markGeschreddert).toHaveBeenCalledWith('crypto-1');
    expect(markGeschreddertByCryptoKeyId).toHaveBeenCalledWith('crypto-1');
    expect(result).toEqual({ geraetZuordnungId: 'zuordnung-1', cryptoKeyId: 'crypto-1', geschreddert: true });

    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith({
      eventTyp: STAMMDATEN_EVENT_CODES.GERAET_ZUORDNUNG_GESCHREDDERT,
      actorTyp: 'benutzer',
      actorSub: 'betrieb-freigeber-sub',
      ergebnis: 'ok',
      objektRef: 'zuordnung-1',
      actorRolle: 'betrieb',
      kontext: { synthetic: true, zaehler_id: 'zaehler-1', antrag_id: 'antrag-1' },
    });
  });

  it('kontext enthaelt AUSSCHLIESSLICH synthetic/zaehler_id/antrag_id — KEIN DevEUI-Klartext/deveui_blind_index (RL-2)', async () => {
    const schluesselRepo = { markGeschreddert: vi.fn(() => Promise.resolve(schluessel())) } as unknown as DeviceSchluesselRepository;
    const geraetZuordnungRepo = {
      markGeschreddertByCryptoKeyId: vi.fn(() => Promise.resolve(zuordnung())),
    } as unknown as DeviceGeraetZuordnungRepository;
    const append: ReturnType<typeof vi.fn> = vi.fn(() =>
      Promise.resolve({ eventId: 'e', lane: 0, tagUtc: 'x', seq: '1', ts: 'x', eventTyp: 'x', ergebnis: 'ok' as const }),
    );
    const auditService = { append } as unknown as AuditService;

    const service = new DeviceKryptoShreddingService(schluesselRepo, geraetZuordnungRepo, auditService);

    await service.shred({ cryptoKeyId: 'crypto-1', zaehlerId: 'zaehler-1', antragId: 'antrag-1', subject: subject() });

    const call = append.mock.calls[0]?.[0] as { kontext: Record<string, unknown> };
    expect(Object.keys(call.kontext).sort()).toEqual(['antrag_id', 'synthetic', 'zaehler_id']);
  });

  it('idempotent: DEK bereits geschreddert -> markGeschreddert() liefert trotzdem einen Wert (Repository-Idempotenz), kein Fehler', async () => {
    const schluesselRepo = {
      markGeschreddert: vi.fn(() => Promise.resolve(schluessel({ keyState: 'geschreddert' }))),
    } as unknown as DeviceSchluesselRepository;
    const geraetZuordnungRepo = {
      markGeschreddertByCryptoKeyId: vi.fn(() => Promise.resolve(zuordnung({ status: 'geschreddert' }))),
    } as unknown as DeviceGeraetZuordnungRepository;
    const auditService = {
      append: vi.fn(() => Promise.resolve({ eventId: 'e', lane: 0, tagUtc: 'x', seq: '1', ts: 'x', eventTyp: 'x', ergebnis: 'ok' as const })),
    } as unknown as AuditService;

    const service = new DeviceKryptoShreddingService(schluesselRepo, geraetZuordnungRepo, auditService);

    const result = await service.shred({ cryptoKeyId: 'crypto-1', zaehlerId: 'zaehler-1', antragId: 'antrag-1', subject: subject() });

    expect(result.geschreddert).toBe(true);
  });

  it('wirft, wenn kein device.schluessel mit dieser crypto_key_id existiert (Datenintegritaetsfehler)', async () => {
    const schluesselRepo = { markGeschreddert: vi.fn(() => Promise.resolve(undefined)) } as unknown as DeviceSchluesselRepository;
    const geraetZuordnungRepo = { markGeschreddertByCryptoKeyId: vi.fn() } as unknown as DeviceGeraetZuordnungRepository;
    const auditService = { append: vi.fn() } as unknown as AuditService;

    const service = new DeviceKryptoShreddingService(schluesselRepo, geraetZuordnungRepo, auditService);

    await expect(
      service.shred({ cryptoKeyId: 'unbekannt', zaehlerId: 'zaehler-1', antragId: 'antrag-1', subject: subject() }),
    ).rejects.toThrow();
  });

  it('wirft, wenn keine device.geraet_zuordnung mit dieser crypto_key_id existiert (Datenintegritaetsfehler)', async () => {
    const schluesselRepo = { markGeschreddert: vi.fn(() => Promise.resolve(schluessel())) } as unknown as DeviceSchluesselRepository;
    const geraetZuordnungRepo = {
      markGeschreddertByCryptoKeyId: vi.fn(() => Promise.resolve(undefined)),
    } as unknown as DeviceGeraetZuordnungRepository;
    const auditService = { append: vi.fn() } as unknown as AuditService;

    const service = new DeviceKryptoShreddingService(schluesselRepo, geraetZuordnungRepo, auditService);

    await expect(
      service.shred({ cryptoKeyId: 'crypto-1', zaehlerId: 'zaehler-1', antragId: 'antrag-1', subject: subject() }),
    ).rejects.toThrow();
  });
});
