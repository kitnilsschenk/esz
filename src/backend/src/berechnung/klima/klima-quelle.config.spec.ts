import { afterEach, describe, expect, it, vi } from 'vitest';
import { KlimaQuelleConfigService } from './klima-quelle.config';

describe('KlimaQuelleConfigService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('bleibt ohne Konfiguration synthetisch — eine Instanz greift nicht ungefragt nach außen', () => {
    expect(new KlimaQuelleConfigService().quelle).toBe('synthetic');
  });

  it('schaltet auf den realen Abruf um, wenn es ausdrücklich verlangt ist', () => {
    vi.stubEnv('EDMS_KLIMA_QUELLE', 'dwd');

    const config = new KlimaQuelleConfigService();

    expect(config.quelle).toBe('dwd');
    expect(config.dwdBasisUrl).toBe(
      'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl',
    );
  });

  it('startet gar nicht erst bei einem Tippfehler im Quellennamen', () => {
    // Fail-closed statt stiller Rückfall auf synthetisch: sonst rechnete eine
    // Instanz, die real rechnen sollte, still mit erfundenen Temperaturen.
    vi.stubEnv('EDMS_KLIMA_QUELLE', 'DWD');

    expect(() => new KlimaQuelleConfigService()).toThrow(/EDMS_KLIMA_QUELLE='DWD' ist ungueltig/);
  });

  it('lässt keine ungesicherte Verbindung zu einem fremden Host zu', () => {
    // Klimadaten sind öffentlich — aber über http könnte ein Dritter die
    // Zahlen ändern, aus denen die Baseline entsteht.
    vi.stubEnv('EDMS_DWD_BASIS_URL', 'http://opendata.dwd.de/irgendwas');

    expect(() => new KlimaQuelleConfigService()).toThrow(/muss https sein/);
  });

  it('erlaubt http nur für den lokalen Test-Doppelgänger', () => {
    vi.stubEnv('EDMS_DWD_BASIS_URL', 'http://localhost:8099/cdc/');

    expect(new KlimaQuelleConfigService().dwdBasisUrl).toBe('http://localhost:8099/cdc');
  });

  it('weist eine unbrauchbare Grenzangabe ab, statt sie als "keine Grenze" zu lesen', () => {
    vi.stubEnv('EDMS_DWD_MAX_DOWNLOAD_BYTES', '0');

    expect(() => new KlimaQuelleConfigService()).toThrow(/positive Ganzzahl/);
  });
});
