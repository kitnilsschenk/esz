import { describe, expect, it } from 'vitest';
import { DecoderRegistry } from './decoder-registry';
import { SynthetischReferenzV1Decoder } from './synthetisch-referenz-v1.decoder';
import { DezemHarvey2Decoder } from './dezem-harvey-2.decoder';
import type { UplinkFrame } from './geraetetyp-decoder.types';

function registry(): DecoderRegistry {
  const r = new DecoderRegistry();
  r.register(new SynthetischReferenzV1Decoder());
  r.register(new DezemHarvey2Decoder());
  return r;
}

describe('Gerätetyp-Katalog (ADR-0011)', () => {
  it('führt jeden registrierten Gerätetyp in seiner Original-Schreibweise', () => {
    // Nachgeschlagen wird normalisiert, ANGEZEIGT wird, wie der Decoder sich
    // nennt — sonst stünde „dezem harvey 2" in der Oberfläche.
    expect(registry().katalog().map((d) => d.geraetetyp)).toEqual(['DeZem Harvey 2', 'synthetisch-referenz-v1']);
  });

  it('gibt für „DeZem Harvey 2" genau einen erwarteten Kanal aus', () => {
    const decoder = registry().katalog().find((d) => d.geraetetyp === 'DeZem Harvey 2');

    expect(decoder?.erwarteteKanaele).toEqual([
      {
        messgroesse: 'wirkarbeit',
        einheit: 'kWh',
        art: 'kumulativ_zaehlerstand',
        beschreibung: 'Wirkarbeit über alle drei Phasen (Summenzählwerk)',
      },
    ]);
  });

  it('führt für den synthetischen Decoder KEINE Vorlage', () => {
    // Er liest Messgröße und Einheit aus dem Payload; eine Vorlage wäre eine
    // Behauptung über fremde Erzeuger.
    const decoder = registry().katalog().find((d) => d.geraetetyp === 'synthetisch-referenz-v1');

    expect(decoder?.erwarteteKanaele).toEqual([]);
  });

  it('gibt nur aus, was der Decoder auch erklärt hat', () => {
    // Das ist der Punkt der ganzen Konstruktion: Vorlage und tatsächliche
    // Ausgabe dürfen nicht auseinanderlaufen. Täten sie es, legte jemand
    // einen Kanal nach Vorlage an — und die Uplinks landeten trotzdem in der
    // Quarantäne.
    const decoder = new DezemHarvey2Decoder();
    const frame: UplinkFrame = {
      data: Buffer.alloc(0),
      fPort: 30,
      objekt: { sum_in123_kWh: 6021.41 },
    };

    for (const messwert of decoder.decode(frame)) {
      expect(decoder.erwarteteKanaele).toContainEqual(
        expect.objectContaining({
          messgroesse: messwert.messgroesse,
          einheit: messwert.einheit,
          art: messwert.art,
        }),
      );
    }
  });
});
