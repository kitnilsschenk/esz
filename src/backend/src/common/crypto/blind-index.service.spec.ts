import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlindIndexService } from './blind-index.service';
import type { BlindIndexPepperPort } from './blind-index-pepper.port';
import { LocalDevPepperAdapter } from './local-dev-pepper.adapter';

const ENV_KEY = 'EDMS_DEV_BLIND_INDEX_PEPPER';

function fakePepperPort(pepper: Buffer, version = 1): BlindIndexPepperPort {
  return { getActivePepper: () => Promise.resolve({ pepper, version }) };
}

describe('BlindIndexService (ADR-0005 §26.3, D14/O4)', () => {
  const pepper = randomBytes(32);
  const service = new BlindIndexService(fakePepperPort(pepper));

  it('ist deterministisch: gleiche DevEUI + gleicher Pepper -> gleicher Blind-Index', async () => {
    const ersteBerechnung = await service.berechne('AA:BB:CC:DD:EE:FF:00:11');
    const zweiteBerechnung = await service.berechne('AA:BB:CC:DD:EE:FF:00:11');

    expect(ersteBerechnung.blindIndex.equals(zweiteBerechnung.blindIndex)).toBe(true);
    expect(ersteBerechnung.pepperVersion).toBe(1);
  });

  it('unterschiedliche DevEUIs erzeugen unterschiedliche Blind-Indizes', async () => {
    const ersteDevEui = await service.berechne('AA:BB:CC:DD:EE:FF:00:11');
    const zweiteDevEui = await service.berechne('AA:BB:CC:DD:EE:FF:00:12');

    expect(ersteDevEui.blindIndex.equals(zweiteDevEui.blindIndex)).toBe(false);
  });

  it('HMAC-SHA256 liefert einen 32-Byte-Blind-Index', async () => {
    const ergebnis = await service.berechne('AABBCCDDEEFF0011');

    expect(ergebnis.blindIndex.length).toBe(32);
  });

  it('Normalisierung: Trennzeichen (":") + Groß-/Kleinschreibung sind aequivalent', async () => {
    const mitTrennzeichenGross = await service.berechne('AA:BB:CC:DD:EE:FF:00:11');
    const ohneTrennzeichenKlein = await service.berechne('aabbccddeeff0011');

    expect(mitTrennzeichenGross.blindIndex.equals(ohneTrennzeichenKlein.blindIndex)).toBe(true);
  });

  it('Normalisierung: Trennzeichen ("-") + Whitespace sind aequivalent zur kanonischen Form', async () => {
    const mitBindestrich = await service.berechne('aa-bb-cc-dd-ee-ff-00-11');
    const mitWhitespace = await service.berechne(' AABBCCDDEEFF0011 ');
    const kanonisch = await service.berechne('AABBCCDDEEFF0011');

    expect(mitBindestrich.blindIndex.equals(kanonisch.blindIndex)).toBe(true);
    expect(mitWhitespace.blindIndex.equals(kanonisch.blindIndex)).toBe(true);
  });

  it('wirft bei zu kurzer DevEUI (kein 16-Hex-Zeichen-Format)', async () => {
    await expect(service.berechne('AABBCC')).rejects.toThrow(/gueltiges Format/);
  });

  it('wirft bei ungueltigen Hex-Zeichen', async () => {
    await expect(service.berechne('ZZZZZZZZZZZZZZZZ')).rejects.toThrow(/gueltiges Format/);
  });

  it('Fehlermeldung bei ungueltiger Eingabe enthaelt NICHT die Klartext-DevEUI (RL-2)', async () => {
    const geheimeDevEui = 'GEHEIM-DEV-EUI!!';

    await expect(service.berechne(geheimeDevEui)).rejects.toSatisfy((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return !message.includes(geheimeDevEui) && !message.toUpperCase().includes('GEHEIMDEVEUI');
    });
  });

  describe('kein Pepper -> fail-closed (echter LocalDevPepperAdapter statt Fake-Port)', () => {
    const originalEnv = process.env[ENV_KEY];

    beforeEach(() => {
      delete process.env[ENV_KEY];
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env[ENV_KEY];
      } else {
        process.env[ENV_KEY] = originalEnv;
      }
    });

    it('die Komposition mit LocalDevPepperAdapter scheitert fail-closed, wenn EDMS_DEV_BLIND_INDEX_PEPPER fehlt', () => {
      expect(() => new BlindIndexService(new LocalDevPepperAdapter())).toThrow(new RegExp(ENV_KEY));
    });
  });
});
