import { describe, expect, it } from 'vitest';
import { DecoderRegistry } from './decoder-registry';
import { SynthetischReferenzV1Decoder } from './synthetisch-referenz-v1.decoder';
import { DezemHarvey2Decoder } from './dezem-harvey-2.decoder';
import type { DecodedMesswert, GeraetetypDecoder, UplinkFrame } from './geraetetyp-decoder.types';

class ImmerFehlschlagenderDecoder implements GeraetetypDecoder {
  readonly geraetetyp = 'kaputt-v1';
  readonly version = 1;
  readonly erwarteteKanaele = [];
  readonly zeitstempelQuelle = 'gateway_server' as const;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Parameter existiert nur fuer die GeraetetypDecoder-Vertragskonformitaet.
  decode(rohframe: UplinkFrame): DecodedMesswert[] {
    throw new Error('immer kaputt');
  }
}

describe('DecoderRegistry (ADR-0005 §23, D11 — nie crashen)', () => {
  it('liefert undefined (kein Werfen) fuer einen unregistrierten Geraetetyp', () => {
    const registry = new DecoderRegistry();
    expect(registry.resolve('unbekannt-v1')).toBeUndefined();
  });

  it('liefert den registrierten Decoder fuer einen bekannten Geraetetyp', () => {
    const registry = new DecoderRegistry();
    const decoder = new SynthetischReferenzV1Decoder();
    registry.register(decoder);

    expect(registry.resolve(decoder.geraetetyp)).toBe(decoder);
  });

  it('registriert mehrere Decoder unabhaengig voneinander (additive Registry)', () => {
    const registry = new DecoderRegistry();
    const decoderA = new SynthetischReferenzV1Decoder();
    const decoderB = new ImmerFehlschlagenderDecoder();
    registry.register(decoderA);
    registry.register(decoderB);

    expect(registry.resolve(decoderA.geraetetyp)).toBe(decoderA);
    expect(registry.resolve(decoderB.geraetetyp)).toBe(decoderB);
  });

  it('das decode()-Werfen eines registrierten Decoders bleibt Aufrufer-Verantwortung (Registry selbst faengt nicht ab)', () => {
    const registry = new DecoderRegistry();
    const decoder = new ImmerFehlschlagenderDecoder();
    registry.register(decoder);

    const resolved = registry.resolve('kaputt-v1');
    expect(resolved).toBeDefined();
    expect(() => resolved?.decode({ data: Buffer.alloc(0), fPort: 1 })).toThrow('immer kaputt');
  });
});

describe('DecoderRegistry — Schreibweise des Gerätetyps (ADR-0011 C2)', () => {
  it('findet den Decoder unabhängig von Groß-/Kleinschreibung und Randleerzeichen', () => {
    // `zaehler.geraetetyp` ist ein Freitextfeld, das ein Mensch tippt. Ein
    // exakter Vergleich hätte jeden Uplink bei abweichender Schreibweise in
    // die Quarantäne geschickt, obwohl der Decoder vorhanden ist.
    const registry = new DecoderRegistry();
    registry.register(new DezemHarvey2Decoder());

    for (const schreibweise of ['DeZem Harvey 2', 'dezem harvey 2', 'DEZEM HARVEY 2', '  DeZem Harvey 2  ']) {
      expect(registry.resolve(schreibweise)).toBeInstanceOf(DezemHarvey2Decoder);
    }
  });

  it('findet nichts für einen tatsächlich anderen Gerätetyp', () => {
    const registry = new DecoderRegistry();
    registry.register(new DezemHarvey2Decoder());

    expect(registry.resolve('DeZem Harvey 3')).toBeUndefined();
  });
});

