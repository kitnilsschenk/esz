import { describe, expect, it, vi } from 'vitest';
import { KryptoShreddingService } from './krypto-shredding.service';
import type { IdentitySubjektSchluesselRepository, SubjektSchluessel } from '../persistence/identity/identity-subjekt-schluessel.repository';

function schluessel(overrides: Partial<SubjektSchluessel> = {}): SubjektSchluessel {
  return {
    id: 'schluessel-1',
    wrappedDek: Buffer.from('wrapped'),
    kmsKeyId: 'dev-local:v1',
    algVersion: 1,
    keyState: 'geschreddert',
    createdAt: '2026-07-01T00:00:00.000Z',
    geschreddertAt: '2026-07-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('KryptoShreddingService (ADR-0008 §19, Art. 17)', () => {
  it('shred() delegiert an markGeschreddert() und meldet geschreddert=true', async () => {
    const markGeschreddert = vi.fn(() => Promise.resolve(schluessel()));
    const repo = { markGeschreddert } as unknown as IdentitySubjektSchluesselRepository;
    const service = new KryptoShreddingService(repo);

    const result = await service.shred('schluessel-1');

    expect(markGeschreddert).toHaveBeenCalledWith('schluessel-1');
    expect(result).toEqual({ subjektSchluesselId: 'schluessel-1', geschreddert: true });
  });

  it('wirft, wenn kein subjekt_schluessel mit dieser id existiert (Datenintegritaetsfehler)', async () => {
    const markGeschreddert = vi.fn(() => Promise.resolve(undefined));
    const repo = { markGeschreddert } as unknown as IdentitySubjektSchluesselRepository;
    const service = new KryptoShreddingService(repo);

    await expect(service.shred('unbekannt')).rejects.toThrow();
  });
});
