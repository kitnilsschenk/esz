import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ConsentEnforcementConfig,
  EDMS_INGEST_CONSENT_ENFORCEMENT,
  EDMS_INGEST_CONSENT_ENFORCEMENT_FREIGABE_REF,
} from './consent-enforcement.config';

describe('ConsentEnforcementConfig (ADR-0012 E5, Stufe C — Schalter fuer die Rechtsgrundlagen-Durchsetzung)', () => {
  const original: Record<string, string | undefined> = {
    [EDMS_INGEST_CONSENT_ENFORCEMENT]: process.env[EDMS_INGEST_CONSENT_ENFORCEMENT],
    [EDMS_INGEST_CONSENT_ENFORCEMENT_FREIGABE_REF]: process.env[EDMS_INGEST_CONSENT_ENFORCEMENT_FREIGABE_REF],
  };

  beforeEach(() => {
    delete process.env[EDMS_INGEST_CONSENT_ENFORCEMENT];
    delete process.env[EDMS_INGEST_CONSENT_ENFORCEMENT_FREIGABE_REF];
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

  it('Default (kein ENV gesetzt): enforced=false — der sichere Ausgangszustand', () => {
    const config = new ConsentEnforcementConfig();
    expect(config.enforced).toBe(false);
    expect(config.freigabeRef).toBeUndefined();
  });

  it('EDMS_INGEST_CONSENT_ENFORCEMENT=false bleibt AUS, auch ohne Freigabe-Referenz', () => {
    process.env[EDMS_INGEST_CONSENT_ENFORCEMENT] = 'false';
    const config = new ConsentEnforcementConfig();
    expect(config.enforced).toBe(false);
  });

  it('fail-closed: enforced=true OHNE Freigabe-Referenz wirft beim Konstruieren', () => {
    process.env[EDMS_INGEST_CONSENT_ENFORCEMENT] = 'true';
    expect(() => new ConsentEnforcementConfig()).toThrow(
      new RegExp(EDMS_INGEST_CONSENT_ENFORCEMENT_FREIGABE_REF),
    );
  });

  it('fail-closed: enforced=true mit LEERER Freigabe-Referenz (nur Whitespace) wirft ebenfalls', () => {
    process.env[EDMS_INGEST_CONSENT_ENFORCEMENT] = 'true';
    process.env[EDMS_INGEST_CONSENT_ENFORCEMENT_FREIGABE_REF] = '   ';
    expect(() => new ConsentEnforcementConfig()).toThrow();
  });

  it('enforced=true MIT Freigabe-Referenz startet fehlerfrei', () => {
    process.env[EDMS_INGEST_CONSENT_ENFORCEMENT] = 'true';
    process.env[EDMS_INGEST_CONSENT_ENFORCEMENT_FREIGABE_REF] = 'votum-2026-09-07-antworten.md#stufe-c';
    const config = new ConsentEnforcementConfig();
    expect(config.enforced).toBe(true);
    expect(config.freigabeRef).toBe('votum-2026-09-07-antworten.md#stufe-c');
  });

  it('fail-closed: unbekannter Wert wirft mit erklaerender Meldung', () => {
    process.env[EDMS_INGEST_CONSENT_ENFORCEMENT] = 'wat';
    expect(() => new ConsentEnforcementConfig()).toThrow(new RegExp(EDMS_INGEST_CONSENT_ENFORCEMENT));
  });
});
