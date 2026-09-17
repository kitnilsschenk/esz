import { describe, expect, it } from 'vitest';
import { GeraetetypKatalogController } from './geraetetyp-katalog.controller';
import { DecoderRegistry } from '../../ingest-worker/decoder/decoder-registry';
import { DezemHarvey2Decoder } from '../../ingest-worker/decoder/dezem-harvey-2.decoder';
import { SynthetischReferenzV1Decoder } from '../../ingest-worker/decoder/synthetisch-referenz-v1.decoder';

function controller(): GeraetetypKatalogController {
  const registry = new DecoderRegistry();
  registry.register(new SynthetischReferenzV1Decoder());
  registry.register(new DezemHarvey2Decoder());
  return new GeraetetypKatalogController(registry);
}

describe('GeraetetypKatalogController (ADR-0011)', () => {
  it('gibt die Kanal-Vorlage aus, die der Decoder tatsächlich befüllt', () => {
    const { daten } = controller().katalog();
    const dezem = daten.find((item) => item.geraetetyp === 'DeZem Harvey 2');

    expect(dezem?.erwarteteKanaele).toEqual([
      {
        messgroesse: 'wirkarbeit',
        einheit: 'kWh',
        art: 'kumulativ_zaehlerstand',
        beschreibung: 'Wirkarbeit über alle drei Phasen (Summenzählwerk)',
      },
    ]);
  });

  it('führt auch Gerätetypen ohne Vorlage — mit leerer Liste, nicht ausgelassen', () => {
    // Ein fehlender Eintrag sähe aus wie „Gerätetyp unbekannt"; die leere
    // Liste sagt korrekt „liefert keine feste Kanal-Vorlage".
    const { daten } = controller().katalog();
    const synthetisch = daten.find((item) => item.geraetetyp === 'synthetisch-referenz-v1');

    expect(synthetisch).toBeDefined();
    expect(synthetisch?.erwarteteKanaele).toEqual([]);
  });

  it('nennt eine Version je Gerätetyp', () => {
    for (const item of controller().katalog().daten) {
      expect(item.version).toBeGreaterThanOrEqual(1);
    }
  });

  it('gibt keine Zugangsdaten, Rohframes oder sonstigen Innereien preis', () => {
    const serialisiert = JSON.stringify(controller().katalog());

    expect(Object.keys(controller().katalog().daten[0] ?? {})).toEqual([
      'geraetetyp',
      'version',
      'erwarteteKanaele',
    ]);
    expect(serialisiert).not.toContain('decode');
  });
});
