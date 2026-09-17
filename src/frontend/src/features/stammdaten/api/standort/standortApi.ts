// Einzige Stelle, die für die Standort-Ressource `apiClient.GET/POST/PATCH/
// PUT/DELETE(...)` aufruft (`.claude/rules/frontend-react.md`). Jede
// Funktion hier mappt Fehler sofort über `toApiProblemError` (analog
// `zaehlerApi.ts`). ADR-0010 D5 — KRITISCHE Trennung: `fetchStandortBaum`
// ruft AUSSCHLIESSLICH die Struktur-Route (`.../standorte`, PII-frei),
// `postStandortLabelsBatch` AUSSCHLIESSLICH die Label-Route
// (`.../standorte/labels`) — niemals vermischt.

import {
  apiClient,
  toApiProblemError,
  type StandortAendern,
  type StandortAnlegen,
  type StandortLabelItem,
  type StandortLoeschErgebnis,
  type StandortPiiAendern,
  type StandortPiiDetail,
  type StandortStilllegen,
  type StandortStillgelegtErgebnis,
  type StandortStruktur,
  type StandortVerschieben,
  type StandortVerschobenErgebnis,
  type ZaehlerStandortAktuellDetail,
  type ZaehlerStandortDetail,
  type ZaehlerUnterKnotenItem,
  type ZaehlerVerortungAnlegen,
  type ZaehlerVerortungBeenden,
} from '@edms/shared';
import { createIdempotencyKey } from '../shared';
import { STANDORT_LABELS_MAX_BATCH_GROESSE } from './standortConstants';

/**
 * `read:standort` — Struktur-Baum EINES Endkunden, PII-frei (D5 Linie 1).
 * v1 lädt bewusst IMMER den gesamten Baum (kein `wurzelId`/`maxTiefe`-Filter
 * aus der UI heraus) — das harte Tiefenlimit (0-9, D2.3) begrenzt die
 * Knotenzahl je Endkunde strukturell, die API selbst kennt ohnehin keine
 * Cursor-Pagination für diese Route (`standorteListe`-Doku-Kommentar,
 * generierter Client).
 */
export async function fetchStandortBaum(endkundeId: string): Promise<StandortStruktur[]> {
  const { data, error } = await apiClient.GET('/stammdaten/endkunden/{endkundeId}/standorte', {
    params: { path: { endkundeId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

/**
 * `read:standort_pii` — Batch-Entschlüsselung für die Baum-UI (D5 Linie 2).
 * EIN Aufruf für die gesamte übergebene Id-Menge — NICHT einer je Knoten
 * (der zentrale Punkt dieses Auftrags: der Audit-Trail trägt GENAU EIN
 * `standort.pii.einsicht`-Event je Aufruf, `kontext.anzahl_knoten`). Chunkt
 * NUR, falls die sichtbare Knotenmenge die serverseitige Obergrenze
 * (`MAX_BATCH_GROESSE`, `standort-labels-anfrage.dto.ts`) überschreitet —
 * ein in der Praxis seltener Randfall (Nutzer müsste sehr viele Knoten
 * gleichzeitig aufgeklappt haben); jeder Chunk bleibt dabei weiterhin ein
 * EINZELNER Batch-Aufruf über bis zu 500 Ids, kein Aufruf pro Knoten.
 *
 * Trägt (wie jeder schreibende POST) einen `Idempotency-Key`-Header — die
 * OpenAPI-Spec (`stammdaten.openapi.yaml`) verlangt ihn für diese Route
 * ungeachtet dessen, dass sie fachlich rein lesend ist (`read:standort_pii`,
 * kein `@IdempotencyKey()`-Parameter im NestJS-Controller); der generierte
 * Client erzwingt ihn daher typseitig. Ein Wert schadet nicht — der
 * Controller ignoriert einen ihm unbekannten Header ohnehin.
 */
export async function postStandortLabelsBatch(endkundeId: string, standortIds: readonly string[]): Promise<StandortLabelItem[]> {
  if (standortIds.length === 0) {
    return [];
  }
  const chunks = chunk(standortIds, STANDORT_LABELS_MAX_BATCH_GROESSE);
  const ergebnisse = await Promise.all(
    chunks.map(async (idsChunk) => {
      const { data, error } = await apiClient.POST('/stammdaten/endkunden/{endkundeId}/standorte/labels', {
        params: { path: { endkundeId }, header: { 'Idempotency-Key': createIdempotencyKey() } },
        body: { standortIds: idsChunk },
      });
      if (error) {
        throw toApiProblemError(error);
      }
      return data;
    }),
  );
  return ergebnisse.flat();
}

export interface StandortAnlegenInput extends StandortAnlegen {
  readonly endkundeId: string;
}

/** `create:standort` — Wurzel- ODER Kind-Anlage (Struktur + PII in einer Backend-Transaktion). */
export async function postStandortAnlegen(input: StandortAnlegenInput, idempotencyKey: string): Promise<StandortStruktur> {
  const { endkundeId, ...body } = input;
  const { data, error } = await apiClient.POST('/stammdaten/endkunden/{endkundeId}/standorte', {
    params: { path: { endkundeId }, header: { 'Idempotency-Key': idempotencyKey } },
    body,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `update:standort` — Struktur NUR (`typ`/`sortierung`), NICHT `status`/PII. */
export async function patchStandortAendern(standortId: string, input: StandortAendern, idempotencyKey: string): Promise<StandortStruktur> {
  const { data, error } = await apiClient.PATCH('/stammdaten/standorte/{standortId}', {
    params: { path: { standortId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `update:standort` — PII-Vollersatz (D5: Schreiben ist kein Lesen). */
export async function putStandortPiiAendern(standortId: string, input: StandortPiiAendern, idempotencyKey: string): Promise<StandortPiiDetail> {
  const { data, error } = await apiClient.PUT('/stammdaten/standorte/{standortId}/pii', {
    params: { path: { standortId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `update:standort` — Reparent (D6). Server lehnt Zyklus/Tiefenlimit/Fremdmandant ab (409/400). */
export async function postStandortVerschieben(
  standortId: string,
  input: StandortVerschieben,
  idempotencyKey: string,
): Promise<StandortVerschobenErgebnis> {
  const { data, error } = await apiClient.POST('/stammdaten/standorte/{standortId}/verschieben', {
    params: { path: { standortId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `update:standort` — Zustandswechsel `aktiv` → `stillgelegt` (D2.6), IDEMPOTENT, KEIN Hard-Delete. */
export async function postStandortStilllegen(
  standortId: string,
  input: StandortStilllegen,
  idempotencyKey: string,
): Promise<StandortStillgelegtErgebnis> {
  const { data, error } = await apiClient.POST('/stammdaten/standorte/{standortId}/stilllegen', {
    params: { path: { standortId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `delete:standort` — Hart-Löschen (D2.6, nur Blattknoten ohne Verortungshistorie), IDEMPOTENT im HTTP-Sinn. */
export async function deleteStandortLoeschen(standortId: string, idempotencyKey: string): Promise<StandortLoeschErgebnis> {
  const { data, error } = await apiClient.DELETE('/stammdaten/standorte/{standortId}', {
    params: { path: { standortId }, header: { 'Idempotency-Key': idempotencyKey } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export interface ZaehlerUnterKnotenParams {
  readonly [key: string]: string | number | boolean | undefined;
  readonly stichtag?: string;
  readonly inklusiveUnterknoten?: boolean;
}

/** `read:standort` — Kern-Query (D6): alle Zähler unter diesem Knoten zum Stichtag T, PII-frei. */
export async function fetchZaehlerUnterKnoten(standortId: string, params: ZaehlerUnterKnotenParams = {}): Promise<ZaehlerUnterKnotenItem[]> {
  const { data, error } = await apiClient.GET('/stammdaten/standorte/{standortId}/zaehler', {
    params: {
      path: { standortId },
      query: {
        ...(params.stichtag !== undefined ? { stichtag: params.stichtag } : {}),
        ...(params.inklusiveUnterknoten !== undefined ? { inklusiveUnterknoten: params.inklusiveUnterknoten } : {}),
      },
    },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `read:standort` — aktuelle Verortung EINES Zählers inkl. Breadcrumb-Pfad
 * (D6, Wurzel zuerst), PII-frei (D5). `verortet=false` ist der EMPTY-STATE
 * (200, kein 404) — Zähler ohne Verortung ODER nur mit historischen
 * (bereits beendeten) Verortungen. Schließt die Umkehrrichtung zu
 * `fetchZaehlerUnterKnoten` (Betriebs-UI-Konzept Punkt 3, Standort-Breadcrumb
 * auf der Zähler-Detailseite). Labels werden GETRENNT über
 * `postStandortLabelsBatch` geholt — dieser Aufruf liefert NIEMALS Bezeichnung/Adresse.
 */
export async function fetchZaehlerAktuelleVerortung(zaehlerId: string): Promise<ZaehlerStandortAktuellDetail> {
  const { data, error } = await apiClient.GET('/stammdaten/zaehler/{zaehlerId}/verortung', {
    params: { path: { zaehlerId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export interface ZaehlerVerortungAnlegenInput extends ZaehlerVerortungAnlegen {
  readonly zaehlerId: string;
}

/**
 * `create:zaehler_standort` — "Umsetzen": öffnet eine neue Zeitscheibe UND
 * schließt — sofern vorhanden — die offene Vorgänger-Verortung dieses
 * Zählers atomar in derselben Backend-Transaktion (D3). Die Antwort trägt
 * NUR die neue Zeitscheibe; die UI stellt den Vorgang trotzdem als Verlauf
 * dar (s. `hooks/standort/useStandortZaehlerView.ts`), nicht als Überschreiben.
 */
export async function postZaehlerVerortungAnlegen(
  input: ZaehlerVerortungAnlegenInput,
  idempotencyKey: string,
): Promise<ZaehlerStandortDetail> {
  const { zaehlerId, ...body } = input;
  const { data, error } = await apiClient.POST('/stammdaten/zaehler/{zaehlerId}/verortung', {
    params: { path: { zaehlerId }, header: { 'Idempotency-Key': idempotencyKey } },
    body,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export interface ZaehlerVerortungBeendenInput extends ZaehlerVerortungBeenden {
  readonly zaehlerId: string;
}

/** `update:zaehler_standort` — beendet die aktuell offene Verortung dieses Zählers, IDEMPOTENT bzgl. desselben Endzeitpunkts. */
export async function postZaehlerVerortungBeenden(
  input: ZaehlerVerortungBeendenInput,
  idempotencyKey: string,
): Promise<ZaehlerStandortDetail> {
  const { zaehlerId, ...body } = input;
  const { data, error } = await apiClient.POST('/stammdaten/zaehler/{zaehlerId}/verortung/beenden', {
    params: { path: { zaehlerId }, header: { 'Idempotency-Key': idempotencyKey } },
    body,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
