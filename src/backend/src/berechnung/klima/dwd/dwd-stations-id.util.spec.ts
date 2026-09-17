import { describe, expect, it } from 'vitest';
import { DwdStationsIdFehler, toDwdStationsId } from './dwd-stations-id.util';

describe('toDwdStationsId', () => {
  it('füllt kurze Nummern auf fünf Stellen auf — so heißen die CDC-Dateien', () => {
    expect(toDwdStationsId('433')).toBe('00433');
    expect(toDwdStationsId('01420')).toBe('01420');
  });

  it('versteht die Schreibweise mit Präfix', () => {
    expect(toDwdStationsId('DWD-1420')).toBe('01420');
    expect(toDwdStationsId('DWD_01420')).toBe('01420');
    expect(toDwdStationsId('dwd433')).toBe('00433');
  });

  it('ignoriert umschließende Leerzeichen', () => {
    expect(toDwdStationsId('  00433 ')).toBe('00433');
  });

  it.each(['DEMO-STATION-A', 'TEST-STATION', '', '12345678', 'DWD-', 'STATION_433'])(
    'weist die nicht auflösbare Referenz %j ab, statt eine URL zu raten',
    (stationRef) => {
      expect(() => toDwdStationsId(stationRef)).toThrow(DwdStationsIdFehler);
    },
  );

  it('lässt keinen Pfadwechsel in den Dateinamen', () => {
    // Zweite Schutzlinie hinter der DTO-Whitelist (M2, security-auditor):
    // nach dieser Funktion besteht die Referenz nur noch aus fünf Ziffern.
    expect(() => toDwdStationsId('../../etc/passwd')).toThrow(DwdStationsIdFehler);
    expect(() => toDwdStationsId('00433/../00434')).toThrow(DwdStationsIdFehler);
  });

  it('nennt in der Meldung den Ausweg, nicht nur den Fehler', () => {
    expect(() => toDwdStationsId('DEMO-STATION-A')).toThrow(/EDMS_KLIMA_QUELLE=synthetic/);
  });
});
