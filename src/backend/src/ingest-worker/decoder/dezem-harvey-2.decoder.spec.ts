import { describe, expect, it } from 'vitest';
import { DezemHarvey2Decoder } from './dezem-harvey-2.decoder';
import type { UplinkFrame } from './geraetetyp-decoder.types';

const decoder = new DezemHarvey2Decoder();

/** Auszug aus einem realen fPort-30-Uplink (2026-08-28). */
const PORT30_OBJEKT: Record<string, unknown> = {
  in1_kWh: 2322.85,
  in2_kWh: 1650.94,
  in3_kWh: 2047.62,
  sum_in123_kWh: 6021.41,
  in1_cosphi: 0.853,
  in2_cosphi: 0.625,
  in3_cosphi: 0.765,
  in_ctr_count: 16097209,
  in_ctr_time_elapse: '[D:186|H:7|M:26|S:49]',
  flags: { in1_power_en: true, dummy: true },
};

/** Auszug aus einem realen fPort-10-Uplink (2026-08-27) — reine Momentanwerte. */
const PORT10_OBJEKT: Record<string, unknown> = {
  sum_in123_pow_act_W: 14450.25,
  in1_pow_act_W: 5783.16,
  in1_ac_A: 26.951,
  in1_coeff: 7500,
  in4_voltage_VAC: 224.67,
  temp_C: 19.6,
  vsys_V: 3.63,
};

function frame(fPort: number, objekt?: Record<string, unknown>): UplinkFrame {
  return {
    data: Buffer.from('AwMDuZ/1AF2LAwDTOuaEAgAAOdofAwAfOg==', 'base64'),
    fPort,
    ...(objekt !== undefined ? { objekt } : {}),
  };
}

describe('DezemHarvey2Decoder (ADR-0011 C2/§5a)', () => {
  it('liest die Phasensumme als kumulativen Zählerstand in kWh', () => {
    expect(decoder.decode(frame(30, PORT30_OBJEKT))).toEqual([
      { messgroesse: 'wirkarbeit', wertRoh: 6021.41, einheit: 'kWh', art: 'kumulativ_zaehlerstand' },
    ]);
  });

  it('speist die Einzelphasen NICHT ein — sie stecken in der Summe', () => {
    // Beides zu schreiben hieße, dieselbe Energie doppelt zu führen. Wer
    // später über Messkanäle summiert, käme auf den doppelten Verbrauch.
    const werte = decoder.decode(frame(30, PORT30_OBJEKT));

    expect(werte).toHaveLength(1);
    const einzelphasen = [2322.85, 1650.94, 2047.62];
    expect(werte.map((w) => w.wertRoh)).not.toEqual(expect.arrayContaining(einzelphasen));
  });

  it('ignoriert Diagnose-Felder, den Impulszähler und die Laufzeit-Zeichenkette', () => {
    // `in_ctr_time_elapse` ist ein String — ein Zahlen-Mapper muss ihn
    // überspringen, nicht daran scheitern.
    expect(() => decoder.decode(frame(30, PORT30_OBJEKT))).not.toThrow();
    expect(decoder.decode(frame(30, PORT30_OBJEKT))).toHaveLength(1);
  });

  it('liefert für einen Diagnose-Uplink auf fPort 10 eine leere Liste — kein Fehler', () => {
    // Eine Nachricht ohne Messwert ist kein Fehlschlag; sie gehört nicht in
    // die Quarantäne.
    expect(decoder.decode(frame(10, PORT10_OBJEKT))).toEqual([]);
  });

  it('liefert auch für unbekannte Ports eine leere Liste', () => {
    expect(decoder.decode(frame(1, PORT30_OBJEKT))).toEqual([]);
  });

  it('scheitert, wenn am Geräteprofil kein Codec hinterlegt ist', () => {
    // Ohne `object` ist der Zählerstand nicht ablesbar. Das gehört als
    // `decode_fehler` in die Quarantäne, nicht stillschweigend übergangen.
    expect(() => decoder.decode(frame(30))).toThrow(/kein dekodiertes `object`/);
  });

  it('scheitert, wenn auf dem Energie-Port die Summe fehlt', () => {
    const ohneSumme = { ...PORT30_OBJEKT };
    delete ohneSumme['sum_in123_kWh'];

    expect(() => decoder.decode(frame(30, ohneSumme))).toThrow(/sum_in123_kWh/);
  });

  it('scheitert bei einem nicht-numerischen Zählerstand', () => {
    expect(() => decoder.decode(frame(30, { ...PORT30_OBJEKT, sum_in123_kWh: '6021.41' }))).toThrow(/keine Zahl/);
    expect(() => decoder.decode(frame(30, { ...PORT30_OBJEKT, sum_in123_kWh: Number.NaN }))).toThrow(/keine Zahl/);
  });

  it('nimmt den Gateway-Zeitstempel — das Gerät sendet keinen eigenen', () => {
    // `in_ctr_time_elapse` ist eine Laufzeit, kein Zeitpunkt.
    expect(decoder.zeitstempelQuelle).toBe('gateway_server');
  });
});
