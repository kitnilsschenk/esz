import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SyntheticOnlyConfigService } from './synthetic-only.config';

const ENV_CLASS_KEY = 'EDMS_ENV_CLASS';
const SYNTHETIC_ONLY_KEY = 'EDMS_SYNTHETIC_ONLY';

describe('SyntheticOnlyConfigService (ADR-0008 §22, D10 — Startup-Self-Check)', () => {
  const originalEnvClass = process.env[ENV_CLASS_KEY];
  const originalSyntheticOnly = process.env[SYNTHETIC_ONLY_KEY];

  beforeEach(() => {
    delete process.env[ENV_CLASS_KEY];
    delete process.env[SYNTHETIC_ONLY_KEY];
  });

  afterEach(() => {
    if (originalEnvClass === undefined) {
      delete process.env[ENV_CLASS_KEY];
    } else {
      process.env[ENV_CLASS_KEY] = originalEnvClass;
    }
    if (originalSyntheticOnly === undefined) {
      delete process.env[SYNTHETIC_ONLY_KEY];
    } else {
      process.env[SYNTHETIC_ONLY_KEY] = originalSyntheticOnly;
    }
  });

  it('Default (keine Env gesetzt): EDMS_SYNTHETIC_ONLY=true, EDMS_ENV_CLASS=dev — startet fehlerfrei', () => {
    const config = new SyntheticOnlyConfigService();
    expect(config.syntheticOnly).toBe(true);
    expect(config.envClass).toBe('dev');
  });

  it('EDMS_SYNTHETIC_ONLY=true + EDMS_ENV_CLASS=staging ist zulaessig', () => {
    process.env[ENV_CLASS_KEY] = 'staging';
    const config = new SyntheticOnlyConfigService();
    expect(config.envClass).toBe('staging');
  });

  it('fail-closed: EDMS_SYNTHETIC_ONLY=true + EDMS_ENV_CLASS=prod wirft (widersprüchliche Kombination)', () => {
    process.env[ENV_CLASS_KEY] = 'prod';
    expect(() => new SyntheticOnlyConfigService()).toThrow(/EDMS_ENV_CLASS=prod/);
  });

  it('fail-closed: EDMS_SYNTHETIC_ONLY=false wirft in diesem Codestand IMMER (kein Prod-KMS/Gate-Marker-Store)', () => {
    process.env[SYNTHETIC_ONLY_KEY] = 'false';
    expect(() => new SyntheticOnlyConfigService()).toThrow(/EDMS_SYNTHETIC_ONLY=false/);
  });

  it('fail-closed: unbekannter EDMS_ENV_CLASS-Wert wirft', () => {
    process.env[ENV_CLASS_KEY] = 'wat';
    expect(() => new SyntheticOnlyConfigService()).toThrow(/EDMS_ENV_CLASS/);
  });

  it('fail-closed: unbekannter EDMS_SYNTHETIC_ONLY-Wert wirft', () => {
    process.env[SYNTHETIC_ONLY_KEY] = 'ja';
    expect(() => new SyntheticOnlyConfigService()).toThrow(/EDMS_SYNTHETIC_ONLY/);
  });
});
