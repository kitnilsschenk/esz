// Einzige Stelle, die für die Export-Ressource `apiClient.GET/POST(...)`
// aufruft (`.claude/rules/frontend-react.md`).
//
// **Rollenschnitt (Auflage A19/B10):** `read:nachweis_export` ist die
// schutzwürdigste Leseaktion des ADR und AUSSCHLIESSLICH Rolle `betrieb` —
// `compliance-auditor` erhält hier 403, ANDERS als bei `read:einreichung`.
//
// **Keine Byte-Ablage (O-B10):** Der Server speichert nur Metadaten/Hashes.
// Jeder Datei-Abruf rendert deterministisch NEU und verifiziert gegen den
// persistierten Hash (A.8.24) — deshalb gibt es auch keine „Export-Liste":
// ein Export ist ein Vorgang, kein abgelegtes Dokument.

import {
  apiClient,
  toApiProblemError,
  type NachweisExportAntwort,
  type NachweisExportErzeugen,
} from '@edms/shared';

export interface NachweisExportErzeugenInput extends NachweisExportErzeugen {
  readonly einsparlaufId: string;
}

/**
 * `POST /nachweis/einsparlaeufe/{id}/exporte` (`create:nachweis_export`,
 * Rolle `betrieb`). `einsparlaufId` ist Teil des Eingabe-Objekts (nicht ein
 * zweiter Funktionsparameter), damit die Funktion unverändert in die
 * geteilte `createAnlegenMutation`-Fabrik passt (analog
 * `MesskonzeptVersionAnlegenInput`).
 */
export async function postNachweisExportErzeugen(
  input: NachweisExportErzeugenInput,
  idempotencyKey: string,
): Promise<NachweisExportAntwort> {
  const { einsparlaufId, ...body } = input;
  const { data, error } = await apiClient.POST('/nachweis/einsparlaeufe/{einsparlaufId}/exporte', {
    params: { path: { einsparlaufId }, header: { 'Idempotency-Key': idempotencyKey } },
    body,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /nachweis/exporte/{exportId}` — Kopf + Datei-Manifest (Metadaten/Hashes, KEINE Inhalte). */
export async function fetchNachweisExportDetail(exportId: string): Promise<NachweisExportAntwort> {
  const { data, error } = await apiClient.GET('/nachweis/exporte/{exportId}', {
    params: { path: { exportId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `GET /nachweis/exporte/{exportId}/dateien/{dateiname}` — der EINZIGE
 * Nicht-JSON-Response-Body der Spec.
 *
 * Die CSV-Dateien kommen als Text (RFC 4180, UTF-8, CRLF), die
 * Einsparungsnachweis-Mappe seit Exportschema v3 als XLSX — ein
 * ZIP-Container. **`parseAs: 'blob'` deckt beides ab.** Vorher stand hier
 * `'text'`; die Mappe waere darueber als UTF-8 dekodiert und beim Speichern
 * unbrauchbar geworden — ein Fehler, der erst beim Empfaenger auffiele.
 *
 * Ohne `parseAs` versucht `openapi-fetch` den Body als JSON zu lesen und
 * scheitert an der ersten CSV-Zeile.
 *
 * Bewusst KEIN direkter `<a href>`-Download — die Route verlangt einen
 * `Authorization: Bearer`-Header, den eine Browser-Navigation nicht
 * mitschickt; der Inhalt wird deshalb hier geholt und vom Aufrufer zum
 * Speichern angeboten (`dateiDownload.ts`).
 */
export async function fetchNachweisExportDatei(exportId: string, dateiname: string): Promise<Blob> {
  const { data, error } = await apiClient.GET('/nachweis/exporte/{exportId}/dateien/{dateiname}', {
    params: { path: { exportId, dateiname } },
    parseAs: 'blob',
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
