import { afterEach, describe, expect, it } from 'vitest';
import { brokerHostOhneCredentials, loadIngestQuelleCode } from './ingest-quelle.config';

describe('loadIngestQuelleCode (ADR-0011 D8)', () => {
  const vorher = { ...process.env };

  afterEach(() => {
    process.env = { ...vorher };
  });

  it('nimmt ohne Angabe „standard" an — der Ein-Quellen-Betrieb bleibt konfigurationsfrei', () => {
    delete process.env['EDMS_INGEST_QUELLE_CODE'];
    expect(loadIngestQuelleCode()).toBe('standard');
  });

  it('übernimmt eine eigene Kennung und schneidet Randleerzeichen ab', () => {
    process.env['EDMS_INGEST_QUELLE_CODE'] = '  netz-lahnstein  ';
    expect(loadIngestQuelleCode()).toBe('netz-lahnstein');
  });

  it('weist Kennungen ab, die der Datenbank-Form widersprechen', () => {
    // Der CHECK in V0039 würde sie ohnehin ablehnen — dann aber erst beim
    // ersten Herzschlag, und der Fehler verschwände im Log. Fail-closed beim
    // Start ist die lautere Stelle.
    for (const ungueltig of ['Netz-A', 'netz lahnstein', '-netz', 'netz.a', '', 'ü']) {
      process.env['EDMS_INGEST_QUELLE_CODE'] = ungueltig;
      expect(() => loadIngestQuelleCode()).toThrow(/EDMS_INGEST_QUELLE_CODE/);
    }
  });
});

describe('brokerHostOhneCredentials (ADR-0011 O8)', () => {
  it('entfernt Benutzer und Passwort aus der Broker-URL', () => {
    // Der Wert landet in der Datenbank und von dort in der Oberfläche — ein
    // Passwort darin wäre für jede Rolle mit `read:monitoring` lesbar.
    expect(brokerHostOhneCredentials('mqtt://benutzer:geheim@broker.example:8883')).toBe('broker.example:8883');
    expect(brokerHostOhneCredentials('mqtts://nur_benutzer@broker.example')).toBe('broker.example');
  });

  it('behält Host und Port einer harmlosen URL', () => {
    expect(brokerHostOhneCredentials('mqtt://localhost:1883')).toBe('localhost:1883');
    expect(brokerHostOhneCredentials('mqtts://broker.example')).toBe('broker.example');
  });

  it('reicht eine unparsbare URL NICHT roh durch', () => {
    // Lieber „unbekannt" anzeigen als versehentlich einen Rohstring mit
    // allem, was darin steht.
    expect(brokerHostOhneCredentials('kein-url-format:::')).toBe('unbekannt');
    expect(brokerHostOhneCredentials('')).toBe('unbekannt');
  });

  it('gibt unter keinen Umständen ein @ zurück — der DB-CHECK würde sonst greifen', () => {
    for (const url of [
      'mqtt://a:b@host:1883',
      'mqtt://user@host',
      'mqtts://x:y@z.example:8883',
      'kaputt@@@',
    ]) {
      expect(brokerHostOhneCredentials(url)).not.toContain('@');
    }
  });
});
