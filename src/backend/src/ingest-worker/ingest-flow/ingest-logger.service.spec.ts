import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { IngestLoggerService } from './ingest-logger.service';

describe('IngestLoggerService (ADR-0005 §22 D10 — Feld-Whitelist, PE-7 Log-Level)', () => {
  let warnSpy: MockInstance;
  let debugSpy: MockInstance;
  let errorSpy: MockInstance;
  let logSpy: MockInstance;
  let logger: IngestLoggerService;

  beforeEach(() => {
    warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    logger = new IngestLoggerService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('quarantaene() loggt auf warn-Level (unveraendert, seltenes/diagnoserelevantes Ereignis)', () => {
    logger.quarantaene({ grund: 'devEUI_unbekannt' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    const entry = JSON.parse(warnSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(entry['grund']).toBe('devEUI_unbekannt');
  });

  it('messwertGeschrieben() loggt auf debug-Level (PE-7 — NICHT log/info, Hot-Path-Entlastung)', () => {
    logger.messwertGeschrieben({ messkanalKey: 42, geschrieben: true });

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    const entry = JSON.parse(debugSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(entry['messkanalKey']).toBe(42);
    expect(entry['geschrieben']).toBe(true);
  });

  it('consentVerworfen() loggt auf warn-Level, GANZ OHNE Subjekt-Korrelat (ADR-0012 E5/Stufe C, Auflage C-5)', () => {
    logger.consentVerworfen();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    const entry = JSON.parse(warnSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(entry['ereignis']).toBe('consent_rechtsgrundlage_fehlt');
    // C-5: kein `zaehlerId`, kein sonstiges Subjekt-Korrelat -- nur zwei
    // Schluessel insgesamt (ts, ereignis).
    expect(Object.keys(entry).sort()).toEqual(['ereignis', 'ts']);
  });

  it('infraFehler() loggt auf error-Level mit Kontext + Fehlermeldung (QA-3 — jetzt tatsaechlich verdrahtet)', () => {
    logger.infraFehler('mqtt_uplink_verarbeitung', new Error('ECONNREFUSED'));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(errorSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(entry['kontext']).toBe('mqtt_uplink_verarbeitung');
    expect(entry['fehler']).toBe('ECONNREFUSED');
  });

  it('infraFehler() faengt einen Nicht-Error-Wert ab (kein Crash, generische Fehlermeldung)', () => {
    logger.infraFehler('ctx', 'irgendein String, kein Error-Objekt');

    const entry = JSON.parse(errorSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(entry['fehler']).toBe('unbekannter Fehler');
  });
});
