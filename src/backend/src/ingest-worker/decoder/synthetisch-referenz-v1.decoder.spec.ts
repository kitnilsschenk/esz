import { describe, expect, it } from 'vitest';
import {
  MAX_EINTRAEGE_JE_UPLINK,
  SYNTHETISCH_REFERENZ_V1_GERAETETYP,
  SynthetischReferenzV1Decoder,
} from './synthetisch-referenz-v1.decoder';

function gueltigerEintrag(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    messgroesse: 'wirkarbeit',
    wertRoh: 1,
    einheit: 'kWh',
    art: 'kumulativ_zaehlerstand',
    deviceTimestampIso: '2026-07-17T12:00:00.000Z',
    ...overrides,
  };
}

function payload(obj: unknown): Buffer {
  return Buffer.from(JSON.stringify(obj), 'utf8');
}

describe('SynthetischReferenzV1Decoder (ADR-0005 §23, D11)', () => {
  const decoder = new SynthetischReferenzV1Decoder();

  it('traegt den erwarteten Geraetetyp/Version/Zeitstempelquelle-Vertrag', () => {
    expect(decoder.geraetetyp).toBe(SYNTHETISCH_REFERENZ_V1_GERAETETYP);
    expect(decoder.version).toBe(1);
    expect(decoder.zeitstempelQuelle).toBe('geraet');
  });

  it('decodiert ein einzelnes gueltiges Objekt', () => {
    const result = decoder.decode({
      fPort: 1,
      data: payload({
        messgroesse: 'wirkarbeit',
        obisKennzahl: '1.8.0',
        wertRoh: 12345.678,
        einheit: 'kWh',
        art: 'kumulativ_zaehlerstand',
        deviceTimestampIso: '2026-07-17T12:00:00.000Z',
      }),
    });

    expect(result).toEqual([
      {
        messgroesse: 'wirkarbeit',
        obisKennzahl: '1.8.0',
        wertRoh: 12345.678,
        einheit: 'kWh',
        art: 'kumulativ_zaehlerstand',
        deviceTimestampIso: '2026-07-17T12:00:00.000Z',
      },
    ]);
  });

  it('decodiert ein Array mehrerer Messwerte (Mehrkanal-Uplink)', () => {
    const result = decoder.decode({
      fPort: 1,
      data: payload([
        {
          messgroesse: 'wirkarbeit',
          wertRoh: 1,
          einheit: 'kWh',
          art: 'kumulativ_zaehlerstand',
          deviceTimestampIso: '2026-07-17T12:00:00.000Z',
        },
        {
          messgroesse: 'blindarbeit',
          wertRoh: 2,
          einheit: 'kvarh',
          art: 'kumulativ_zaehlerstand',
          deviceTimestampIso: '2026-07-17T12:00:00.000Z',
        },
      ]),
    });

    expect(result).toHaveLength(2);
  });

  it('optionale Felder fehlen, wenn nicht im Payload vorhanden (kein "undefined"-Leak)', () => {
    const result = decoder.decode({
      fPort: 1,
      data: payload({ messgroesse: 'wirkarbeit', wertRoh: 1, einheit: 'kWh', art: 'intervall_verbrauch' }),
    });

    expect(result[0]).toBeDefined();
    expect('obisKennzahl' in (result[0] ?? {})).toBe(false);
    expect('deviceTimestampIso' in (result[0] ?? {})).toBe(false);
  });

  it('wirft (nie crashen, Aufrufer faengt) bei kaputtem JSON', () => {
    expect(() => decoder.decode({ fPort: 1, data: Buffer.from('{kaputt', 'utf8') })).toThrow();
  });

  it('wirft bei fehlendem Pflichtfeld "messgroesse"', () => {
    expect(() =>
      decoder.decode({ fPort: 1, data: payload({ wertRoh: 1, einheit: 'kWh', art: 'kumulativ_zaehlerstand' }) }),
    ).toThrow(/messgroesse/);
  });

  it('wirft bei ungueltigem "art"-Wert', () => {
    expect(() =>
      decoder.decode({
        fPort: 1,
        data: payload({ messgroesse: 'wirkarbeit', wertRoh: 1, einheit: 'kWh', art: 'unsinn' }),
      }),
    ).toThrow(/"art"/);
  });

  it('wirft bei leerem Array', () => {
    expect(() => decoder.decode({ fPort: 1, data: payload([]) })).toThrow();
  });

  it('wirft bei einem wertRoh, das nach JSON-Parse zu Infinity ueberlaeuft (1e400, syntaktisch gueltiges JSON-Zahlenliteral)', () => {
    expect(() =>
      decoder.decode({
        fPort: 1,
        data: Buffer.from('{"messgroesse":"x","wertRoh":1e400,"einheit":"kWh","art":"kumulativ_zaehlerstand"}'),
      }),
    ).toThrow(/wertRoh/);
  });

  it('SA-2/PE-11: akzeptiert ein Array GENAU an der Eintrags-Obergrenze', () => {
    const eintraege = Array.from({ length: MAX_EINTRAEGE_JE_UPLINK }, () => gueltigerEintrag());
    const result = decoder.decode({ fPort: 1, data: payload(eintraege) });
    expect(result).toHaveLength(MAX_EINTRAEGE_JE_UPLINK);
  });

  it('SA-2/PE-11: wirft, wenn das Array die Eintrags-Obergrenze ueberschreitet (mutwillig/pathologisch grosses Array)', () => {
    const eintraege = Array.from({ length: MAX_EINTRAEGE_JE_UPLINK + 1 }, () => gueltigerEintrag());
    expect(() => decoder.decode({ fPort: 1, data: payload(eintraege) })).toThrow(
      new RegExp(`Obergrenze von ${MAX_EINTRAEGE_JE_UPLINK}`),
    );
  });

  it('QA-6: EIN kaputter Eintrag in einem gemischten Array (1 valide + 1 kaputt) laesst decode() fuer den GESAMTEN Aufruf werfen (atomar, kein Teilerfolg)', () => {
    const gemischt = [gueltigerEintrag(), { messgroesse: 'nur-teilweise-ausgefuellt' /* fehlende Pflichtfelder */ }];
    expect(() => decoder.decode({ fPort: 1, data: payload(gemischt) })).toThrow();
  });
});
