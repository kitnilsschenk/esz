import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SyntheticOnlyConfigService } from '../../stammdaten/synthetic/synthetic-only.config';
import { IngestBrokerModeConfig } from './ingest-broker-mode.config';

const ENV_CLASS_KEY = 'EDMS_ENV_CLASS';
const SYNTHETIC_ONLY_KEY = 'EDMS_SYNTHETIC_ONLY';
const BROKER_MODE_KEY = 'EDMS_INGEST_BROKER_MODE';

describe('IngestBrokerModeConfig (ADR-0005 §19, D7/TD-6 — 2x2-Validitaetsmatrix)', () => {
  const original: Record<string, string | undefined> = {
    [ENV_CLASS_KEY]: process.env[ENV_CLASS_KEY],
    [SYNTHETIC_ONLY_KEY]: process.env[SYNTHETIC_ONLY_KEY],
    [BROKER_MODE_KEY]: process.env[BROKER_MODE_KEY],
  };

  beforeEach(() => {
    delete process.env[ENV_CLASS_KEY];
    delete process.env[SYNTHETIC_ONLY_KEY];
    delete process.env[BROKER_MODE_KEY];
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('gueltige Zelle: mode=synthetic (Default) + synthetic_only=true (Default) startet fehlerfrei', () => {
    const config = new IngestBrokerModeConfig(new SyntheticOnlyConfigService());
    expect(config.mode).toBe('synthetic');
  });

  it('gueltige Zelle: mode=synthetic explizit gesetzt + synthetic_only=true startet fehlerfrei', () => {
    process.env[BROKER_MODE_KEY] = 'synthetic';
    const config = new IngestBrokerModeConfig(new SyntheticOnlyConfigService());
    expect(config.mode).toBe('synthetic');
  });

  it('fail-closed: mode=real + synthetic_only=true (Default) ist IMMER ein Konfigurationsfehler', () => {
    process.env[BROKER_MODE_KEY] = 'real';
    expect(() => new IngestBrokerModeConfig(new SyntheticOnlyConfigService())).toThrow(
      /real erfordert EDMS_SYNTHETIC_ONLY=false/,
    );
  });

  it('fail-closed: mode=real ist in diesem Codestand NIE unterstuetzt — auch bei (hypothetisch) synthetic_only=false', () => {
    // EDMS_SYNTHETIC_ONLY=false wirft bereits in SyntheticOnlyConfigService
    // selbst (kein Prod-KMS gebunden) — das ist die strukturelle
    // Unerreichbarkeit der "real+false"-Zelle, s. Klassen-Kommentar.
    process.env[SYNTHETIC_ONLY_KEY] = 'false';
    process.env[BROKER_MODE_KEY] = 'real';
    expect(() => new IngestBrokerModeConfig(new SyntheticOnlyConfigService())).toThrow(/EDMS_SYNTHETIC_ONLY=false/);
  });

  it('fail-closed: unbekannter EDMS_INGEST_BROKER_MODE-Wert wirft', () => {
    process.env[BROKER_MODE_KEY] = 'wat';
    expect(() => new IngestBrokerModeConfig(new SyntheticOnlyConfigService())).toThrow(/EDMS_INGEST_BROKER_MODE/);
  });

  it('fail-closed: mode=synthetic + EDMS_ENV_CLASS=prod scheitert bereits an SyntheticOnlyConfigService (Vorbedingung)', () => {
    process.env[ENV_CLASS_KEY] = 'prod';
    expect(() => new IngestBrokerModeConfig(new SyntheticOnlyConfigService())).toThrow(/EDMS_ENV_CLASS=prod/);
  });
});
