import { Injectable } from '@nestjs/common';
import type { GeraetetypDecoder } from './geraetetyp-decoder.types';

/**
 * ADR-0005 §23 (D11) — `Map<Geraetetyp, GeraetetypDecoder>`. `resolve()`
 * liefert `undefined` bei unbekanntem Gerätetyp (KEIN Werfen) — der
 * Aufrufer wandelt das in die `unbekannter_geraetetyp`-Quarantaene (§25),
 * niemals ein Absturz.
 */
/**
 * `energy.zaehler.geraetetyp` ist ein FREITEXTFELD, das ein Mensch tippt —
 * „DeZem Harvey 2", „dezem harvey 2", „DeZem Harvey 2 " sind dasselbe Gerät.
 * Ein Nachschlagen auf exakte Gleichheit haette den Uplink bei jeder
 * abweichenden Schreibweise in die Quarantaene geschickt
 * (`unbekannter_geraetetyp`), obwohl der Decoder da ist.
 *
 * Zwei Geraetetypen, die sich NUR in Gross-/Kleinschreibung unterscheiden,
 * waeren ohnehin ein Benennungsproblem — hier geht also nichts verloren.
 */
function normalisiere(geraetetyp: string): string {
  return geraetetyp.trim().toLowerCase();
}

@Injectable()
export class DecoderRegistry {
  private readonly decoders = new Map<string, GeraetetypDecoder>();

  register(decoder: GeraetetypDecoder): void {
    this.decoders.set(normalisiere(decoder.geraetetyp), decoder);
  }

  resolve(geraetetyp: string): GeraetetypDecoder | undefined {
    return this.decoders.get(normalisiere(geraetetyp));
  }

  /**
   * Alle bekannten Geraetetypen mit ihren Kanal-Vorlagen — die Quelle des
   * Geraetetyp-Katalogs, den die Oberflaeche beim Anlegen eines Zaehlers
   * anbietet (ADR-0011). Sortiert, damit die Liste eine stabile Reihenfolge
   * hat; ausgegeben wird der ORIGINAL-Schreibweise des Decoders, nicht die
   * normalisierte Nachschlage-Form.
   */
  katalog(): GeraetetypDecoder[] {
    return [...this.decoders.values()].sort((a, b) => a.geraetetyp.localeCompare(b.geraetetyp, 'de'));
  }
}
