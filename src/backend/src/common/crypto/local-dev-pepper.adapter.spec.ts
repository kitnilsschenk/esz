import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalDevPepperAdapter } from './local-dev-pepper.adapter';

const ENV_KEY = 'EDMS_DEV_BLIND_INDEX_PEPPER';

describe('LocalDevPepperAdapter (ADR-0005 §26.3, RL-3)', () => {
  const originalEnv = process.env[ENV_KEY];

  beforeEach(() => {
    process.env[ENV_KEY] = randomBytes(32).toString('hex');
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
  });

  it('Startup-Self-Check: wirft fail-closed, wenn EDMS_DEV_BLIND_INDEX_PEPPER fehlt', () => {
    delete process.env[ENV_KEY];
    expect(() => new LocalDevPepperAdapter()).toThrow(new RegExp(ENV_KEY));
  });

  it('Startup-Self-Check: wirft fail-closed, wenn der Wert kein gueltiger Hex-String ist', () => {
    process.env[ENV_KEY] = 'kein-hex-string!!';
    expect(() => new LocalDevPepperAdapter()).toThrow(/Hex-String/);
  });

  it('Startup-Self-Check: wirft fail-closed bei zu kurzem Pepper (< 32 Byte)', () => {
    process.env[ENV_KEY] = randomBytes(16).toString('hex');
    expect(() => new LocalDevPepperAdapter()).toThrow(/32 Byte/);
  });

  it('getActivePepper() liefert den dekodierten Pepper + version=1', async () => {
    const hex = randomBytes(32).toString('hex');
    process.env[ENV_KEY] = hex;

    const adapter = new LocalDevPepperAdapter();
    const active = await adapter.getActivePepper();

    expect(active.pepper.equals(Buffer.from(hex, 'hex'))).toBe(true);
    expect(active.version).toBe(1);
  });

  it('akzeptiert einen laengeren Pepper (> 32 Byte) unveraendert', async () => {
    process.env[ENV_KEY] = randomBytes(48).toString('hex');

    const adapter = new LocalDevPepperAdapter();
    const active = await adapter.getActivePepper();

    expect(active.pepper.length).toBe(48);
  });
});
