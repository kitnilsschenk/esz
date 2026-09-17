import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { Fachaktion } from '../../common/decorators/fachaktion.decorator';
import { DecoderRegistry } from '../../ingest-worker/decoder/decoder-registry';
import type { ErwarteterMesskanal } from '../../ingest-worker/decoder/geraetetyp-decoder.types';

export interface GeraetetypKatalogItem {
  readonly geraetetyp: string;
  readonly version: number;
  readonly erwarteteKanaele: readonly ErwarteterMesskanal[];
}

export interface GeraetetypKatalog {
  readonly daten: readonly GeraetetypKatalogItem[];
}

/**
 * `/stammdaten/geraetetypen` — welche Gerätetypen das System auswerten kann
 * und welche Messkanäle sie liefern (ADR-0011).
 *
 * **Warum das ausgerechnet hier hängt:** `messgroesse` und `einheit` am
 * Messkanal sind Freitext, den ein Mensch abtippt, und sie müssen
 * zeichengenau zu dem passen, was der Decoder ausgibt — sonst landet jeder
 * Uplink in der Quarantäne. Dieses Wissen stand bisher ausschließlich im
 * Code des Ingest-Workers, also genau dort, wo die anlegende Person es nicht
 * sehen konnte.
 *
 * **Warum aus der Registry und nicht aus einer Tabelle daneben:** Eine
 * zweite, gepflegte Liste wäre früher oder später von dem abgewichen, was
 * die Decoder tatsächlich liefern — und die Abweichung hätte niemand
 * bemerkt, bis Messwerte ausbleiben. Die Registry ist stand- und zustandslos
 * (reine Klassen, kein Datenbankzugriff); sie hier zu lesen koppelt die API
 * nicht an den Worker-Betrieb.
 */
@Controller('stammdaten/geraetetypen')
export class GeraetetypKatalogController {
  constructor(private readonly decoderRegistry: DecoderRegistry) {}

  @Roles('betrieb', 'compliance-auditor')
  @Fachaktion('read:stammdaten')
  @Get()
  katalog(): GeraetetypKatalog {
    return {
      daten: this.decoderRegistry.katalog().map((decoder) => ({
        geraetetyp: decoder.geraetetyp,
        version: decoder.version,
        erwarteteKanaele: decoder.erwarteteKanaele,
      })),
    };
  }
}
