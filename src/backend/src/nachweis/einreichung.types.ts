import type { Einreichung } from './persistence/nachweis-einreichung.repository';

/**
 * `POST /nachweis/exporte/{id}/einreichungen`, `GET /nachweis/einreichungen/{id}`.
 *
 * Wie beim Export (`nachweis-export.types.ts`) wird die eingefrorene
 * Prüfsumme als **Hex** ausgeliefert, nicht als `Buffer`: Sie dient dem
 * Abgleich gegen die `manifest.csv` der Einreichung und gegen das Audit-Log,
 * und beide führen sie in Hex.
 */
export interface EinreichungAntwort extends Omit<Einreichung, 'manifestHash'> {
  /** Eingefroren, = `export.manifestHash` zum Einreichungszeitpunkt; 64 Hex-Zeichen. */
  readonly manifestHash: string;
}

export function mapEinreichungAntwort(einreichung: Einreichung): EinreichungAntwort {
  return { ...einreichung, manifestHash: einreichung.manifestHash.toString('hex') };
}
