import type { NachweisExport, NachweisExportDatei } from '../persistence/nachweis-export.repository';

/**
 * Prüfsummen verlassen das System als **Hex**, nie als Puffer.
 *
 * Der Zeilentyp führt `manifestHash`/`dateiHash` als `Buffer` — das ist
 * innen richtig (Vergleich per `.equals()`), nach außen aber unbrauchbar:
 * `JSON.stringify(Buffer)` ergibt `{"type":"Buffer","data":[…]}`. Genau das
 * ging einmal live und ließ die Detailseite beim Rendern abstürzen, NACHDEM
 * der Export bereits angelegt war.
 *
 * Hex und nicht Base64, weil die ausgelieferte `manifest.csv` die Hashes in
 * Hex führt (`nachweis-export-renderer.ts`, `renderManifest`) und das
 * Audit-Log ebenso: Was auf dem Bildschirm steht, muss ohne Umrechnung im
 * gelieferten Manifest wiederzufinden sein.
 */
export interface NachweisExportDateiAntwort extends Omit<NachweisExportDatei, 'dateiHash'> {
  /** SHA-256 über den kanonischen Dateiinhalt, 64 Hex-Zeichen. */
  readonly dateiHash: string;
}

/** `POST/GET /nachweis/exporte/{id}` — Kopf + Datei-Manifest (Metadaten/Hashes, KEINE Bytes, O-B10). */
export interface NachweisExportAntwort extends Omit<NachweisExport, 'manifestHash'> {
  /** SHA-256 über die sortierte Dateiliste, 64 Hex-Zeichen. */
  readonly manifestHash: string;
  readonly dateien: readonly NachweisExportDateiAntwort[];
}

export function mapNachweisExportAntwort(exportRow: NachweisExport, dateien: readonly NachweisExportDatei[]): NachweisExportAntwort {
  return {
    ...exportRow,
    manifestHash: exportRow.manifestHash.toString('hex'),
    dateien: dateien.map((d) => ({ ...d, dateiHash: d.dateiHash.toString('hex') })),
  };
}
