// Einzige Stelle, die für die Berechnungslauf-Ressource `apiClient.*`
// aufruft (`.claude/rules/frontend-react.md`). PII-frei — `endkundeId` ist
// ein Pseudonym-Surrogat.
//
// Bis zuletzt war diese Datei NUR-lesend, mit dem Vermerk „Läufe entstehen v1
// ausschließlich serverseitig". Das stimmte für die Ansicht und war für den
// Betrieb eine Sackgasse: Der erste Lauf eines Kunden liess sich nur per
// Skript anlegen, und damit brach die Kette Stammdaten → Messkonzept →
// Baseline → BERECHNUNG → Einsparlauf → Nachweis an ihrer zweiten Stelle ab.

import {
  apiClient,
  toApiProblemError,
  type BerechnungParametervorschlag,
  type BerechnungslaufAnlegen,
  type BerechnungslaufAntwort,
  type BerechnungslaufListe,
} from '@edms/shared';
import type { CursorParams } from '../shared';

// `endkundeId` ist ein PFAD-Parameter (Sub-Ressource, KEIN Query-Filter) —
// hier trotzdem Teil des Filter-Objekts, damit derselbe `createListeQuery`-
// Fabrik-Aufruf wie bei den anderen Entitäten funktioniert (analog
// `MesskonzeptVersionenListenFilter`).
export interface BerechnungslaufListenFilter {
  readonly [key: string]: string | number | boolean | undefined;
  readonly endkundeId: string;
}

/**
 * `read:berechnungslauf` — PII-freie Zusammenfassung je Lauf EINES Endkunden
 * (`GET /berechnung/endkunden/{endkundeId}/laeufe`, Cursor-paginiert, OHNE
 * `ergebnisse`-Monatszeilen — die kommen über `fetchLaufDetail`).
 */
export async function fetchLaeufeSeite(
  params: CursorParams & BerechnungslaufListenFilter,
): Promise<BerechnungslaufListe> {
  const { data, error } = await apiClient.GET('/berechnung/endkunden/{endkundeId}/laeufe', {
    params: {
      path: { endkundeId: params.endkundeId },
      query: {
        ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
      },
    },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `read:berechnungslauf` — EIN Berechnungslauf inkl. `ergebnisse`-Monatszeilen
 * (`GET /berechnung/laeufe/{laufId}`), PII-frei, OHNE Tages-Detail-Snapshots
 * (kein v1-Konsument dieser Route auf noch feinerer Ebene).
 */
export async function fetchLaufDetail(laufId: string): Promise<BerechnungslaufAntwort> {
  const { data, error } = await apiClient.GET('/berechnung/laeufe/{laufId}', {
    params: { path: { laufId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `create:berechnungslauf` — rechnet einen bestehenden Lauf mit
 * UNVERÄNDERTEN Parametern neu und setzt ihn als dessen Ersatz
 * (`POST /berechnung/laeufe/{laufId}/neuberechnung`).
 *
 * Es gibt bewusst keinen Body: Wer korrigiert, soll nichts anderes rechnen
 * können als das Original. Die Parameter kommen aus dem ersetzten Lauf.
 */
export async function postNeuberechnung(laufId: string, idempotencyKey: string): Promise<BerechnungslaufAntwort> {
  const { data, error } = await apiClient.POST('/berechnung/laeufe/{laufId}/neuberechnung', {
    params: { path: { laufId }, header: { 'Idempotency-Key': idempotencyKey } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `read:berechnungslauf` — die Lauf-Parameter aus dem Bestand hergeleitet
 * (`GET /berechnung/parametervorschlag`).
 *
 * Wird VOR dem Rechnen abgerufen: Der Grundlastanteil entscheidet über die
 * Form der Monatskurve, und ein leeres Zahlenfeld dafür wäre eine Ratestelle.
 */
export async function fetchParametervorschlag(
  endkundeId: string,
  mvetId: string,
): Promise<BerechnungParametervorschlag> {
  const { data, error } = await apiClient.GET('/berechnung/parametervorschlag', {
    params: { query: { endkundeId, mvetId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `create:berechnungslauf` — startet einen neuen Lauf
 * (`POST /berechnung/laeufe`).
 *
 * Die Route rechnet SYNCHRON: Die Antwort ist der fertige Lauf samt
 * Monatsergebnissen, kein Auftrag, auf den man warten müsste.
 */
export async function postBerechnungslauf(
  input: BerechnungslaufAnlegen,
  idempotencyKey: string,
): Promise<BerechnungslaufAntwort> {
  const { data, error } = await apiClient.POST('/berechnung/laeufe', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
