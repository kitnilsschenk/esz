import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalDevKmsAdapter } from './local-dev-kms.adapter';

const ENV_KEY = 'EDMS_DEV_KMS_MASTER_KEY';

describe('LocalDevKmsAdapter (ADR-0008 §19, F3/F6-Bedingung 4)', () => {
  const originalEnv = process.env[ENV_KEY];

  beforeEach(() => {
    process.env[ENV_KEY] = randomBytes(32).toString('base64');
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnv;
    }
  });

  it('Startup-Self-Check: wirft fail-closed, wenn EDMS_DEV_KMS_MASTER_KEY fehlt', () => {
    delete process.env[ENV_KEY];
    expect(() => new LocalDevKmsAdapter()).toThrow(/EDMS_DEV_KMS_MASTER_KEY/);
  });

  it('Startup-Self-Check: wirft fail-closed bei falscher Schlüssellänge', () => {
    process.env[ENV_KEY] = Buffer.from('zu kurz').toString('base64');
    expect(() => new LocalDevKmsAdapter()).toThrow(/32 Byte/);
  });

  it('generateDataKey() liefert einen 32-Byte-DEK + kms_key_id="dev-local:v1"', async () => {
    const adapter = new LocalDevKmsAdapter();
    const generated = await adapter.generateDataKey();

    expect(generated.dek.length).toBe(32);
    expect(generated.kmsKeyId).toBe('dev-local:v1');
    expect(generated.algVersion).toBe(1);
    expect(generated.wrappedDek.equals(generated.dek)).toBe(false);
  });

  it('unwrapDek() rekonstruiert exakt den ursprünglichen DEK (Roundtrip)', async () => {
    const adapter = new LocalDevKmsAdapter();
    const generated = await adapter.generateDataKey();

    const unwrapped = await adapter.unwrapDek({
      wrappedDek: generated.wrappedDek,
      kmsKeyId: generated.kmsKeyId,
      algVersion: generated.algVersion,
    });

    expect(unwrapped.equals(generated.dek)).toBe(true);
  });

  it('unwrapDek() lehnt einen fremden kms_key_id ab (versehentlicher Prod-Un-Wrap-Versuch erkennbar)', async () => {
    const adapter = new LocalDevKmsAdapter();
    const generated = await adapter.generateDataKey();

    await expect(
      adapter.unwrapDek({ wrappedDek: generated.wrappedDek, kmsKeyId: 'aws-kms:prod-key', algVersion: 1 }),
    ).rejects.toThrow(/kms_key_id/);
  });

  it('unwrapDek() lehnt eine unbekannte alg_version ab', async () => {
    const adapter = new LocalDevKmsAdapter();
    const generated = await adapter.generateDataKey();

    await expect(
      adapter.unwrapDek({ wrappedDek: generated.wrappedDek, kmsKeyId: generated.kmsKeyId, algVersion: 2 }),
    ).rejects.toThrow(/alg_version/);
  });

  it('zwei Instanzen mit unterschiedlichem Master-Key können sich nicht gegenseitig entpacken', async () => {
    const adapterA = new LocalDevKmsAdapter();
    const generated = await adapterA.generateDataKey();

    process.env[ENV_KEY] = randomBytes(32).toString('base64');
    const adapterB = new LocalDevKmsAdapter();

    await expect(
      adapterB.unwrapDek({ wrappedDek: generated.wrappedDek, kmsKeyId: generated.kmsKeyId, algVersion: 1 }),
    ).rejects.toThrow();
  });
});
