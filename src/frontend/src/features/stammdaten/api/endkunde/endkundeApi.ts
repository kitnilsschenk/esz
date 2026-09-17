// Einzige Stelle, die für die Endkunde-Ressource `apiClient.GET/POST(...)`
// aufruft (`.claude/rules/frontend-react.md`: „API-Calls ausschließlich über
// den generierten OpenAPI-Client in src/shared/api/"). Jede Funktion hier
// mappt Fehler sofort über `toApiProblemError` — die Hooks
// (`useEndkundenListe.ts` etc.) sehen nie einen rohen openapi-fetch-Fehlerwert.

import {
  apiClient,
  toApiProblemError,
  type EinschraenkungUnterrichtung,
  type EndkundeAendern,
  type EndkundeSperren,
  type EndkundeAnlegen,
  type EndkundeDetail,
  type EndkundeListe,
  type KryptoShreddingAnweisung,
  type ShredAblehnenAnweisung,
  type ShredAntrag,
  type ShredAntragListe,
  type ShredFreigebenAnweisung,
  type ShredFreigebenErgebnis,
} from '@edms/shared';
import type { CursorParams } from '../shared';

export async function fetchEndkundenSeite(params: CursorParams): Promise<EndkundeListe> {
  const { data, error } = await apiClient.GET('/stammdaten/endkunden', {
    params: { query: { ...(params.cursor !== undefined ? { cursor: params.cursor } : {}), ...(params.limit !== undefined ? { limit: params.limit } : {}) } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export async function fetchEndkundeDetail(endkundeId: string): Promise<EndkundeDetail> {
  const { data, error } = await apiClient.GET('/stammdaten/endkunden/{endkundeId}', {
    params: { path: { endkundeId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export async function postEndkundeAnlegen(input: EndkundeAnlegen, idempotencyKey: string): Promise<EndkundeDetail> {
  const { data, error } = await apiClient.POST('/stammdaten/endkunden', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

export async function patchEndkundeAendern(
  endkundeId: string,
  input: EndkundeAendern,
  idempotencyKey: string,
): Promise<EndkundeDetail> {
  const { data, error } = await apiClient.PATCH('/stammdaten/endkunden/{endkundeId}', {
    params: { path: { endkundeId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * Sperre nach Art. 18 (kein Hard-Delete) — der Einschränkungsgrund ist
 * PFLICHT (ADR-0007 A11.1). Vormals `DELETE /stammdaten/endkunden/{id}` ohne
 * Body; mit dem Pflicht-Grund ist daraus eine Aktions-Route geworden (Muster
 * `.../standorte/{id}/stilllegen`).
 *
 * Idempotenz ist an den Grund gebunden: derselbe Grund liefert 200 mit
 * unverändertem Zustand, ein ABWEICHENDER Grund 409 — ein bestehender Grund
 * wird serverseitig nie überschrieben.
 */
export async function postEndkundeSperren(
  endkundeId: string,
  input: EndkundeSperren,
  idempotencyKey: string,
): Promise<EndkundeDetail> {
  const { data, error } = await apiClient.POST('/stammdaten/endkunden/{endkundeId}/sperren', {
    params: { path: { endkundeId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

// --- Vier-Augen-Krypto-Shredding (ADR-0009) --------------------------------
// Ersetzt den ENTFERNTEN Direkt-Endpoint `.../kryptoshredding` (Art. 17,
// UNWIDERRUFLICH) durch einen zweistufigen Antrag/Freigabe/Ablehnen-Workflow:
// Schritt 1 (`shredAntragBeantragen`) ist harmlos (legt nur einen Antrag an);
// Schritt 2 (`shredAntragFreigeben`) löst — NUR durch eine ZWEITE Person —
// atomar die tatsächliche Löschung aus. `KryptoShreddingAnweisung` bleibt als
// Body-Typ von Schritt 1 bestehen (identisches DTO, jetzt „Antrag" statt
// „sofort ausführen").

/**
 * `endkundeId` ist Teil des Eingabe-Objekts (nicht ein zweiter
 * Funktionsparameter) — passt so unverändert in die geteilte
 * `createAnlegenMutation`-Fabrik (analog `MesskonzeptVersionAnlegenInput`,
 * `messkonzeptApi.ts`).
 */
export interface ShredAntragBeantragenInput extends KryptoShreddingAnweisung {
  readonly endkundeId: string;
}

/** `operationId: shredAntragBeantragen` — legt einen Antrag an (Status `beantragt`), harmlos. */
export async function postShredAntragBeantragen(
  input: ShredAntragBeantragenInput,
  idempotencyKey: string,
): Promise<ShredAntrag> {
  const { endkundeId, ...body } = input;
  const { data, error } = await apiClient.POST('/stammdaten/endkunden/{endkundeId}/shred-antraege', {
    params: { path: { endkundeId }, header: { 'Idempotency-Key': idempotencyKey } },
    body,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

async function fetchShredAntraegeSeite(endkundeId: string, cursor?: string): Promise<ShredAntragListe> {
  const { data, error } = await apiClient.GET('/stammdaten/endkunden/{endkundeId}/shred-antraege', {
    params: {
      path: { endkundeId },
      // Maximale Seitengröße (`api-contracts.md`: „Cursor + limit max 100"),
      // um die Anzahl der Seiten-Anfragen unten zu minimieren.
      query: { limit: 100, ...(cursor !== undefined ? { cursor } : {}) },
    },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * Sucht den EINEN offenen Antrag (`status === 'beantragt'`) dieses Endkunden
 * — höchstens einer kann je Endkunde existieren (DB-Unique-Index, ADR-0009
 * §2.1/§5). Der Listen-Endpoint liefert ALLE Anträge (jeden Status), älteste
 * zuerst; ein offener Antrag kann daher hinter beliebig vielen bereits
 * abgeschlossenen (abgelehnt/ausgeführt/abgelaufen) Anträgen liegen — diese
 * Funktion blättert deshalb vollständig durch alle Seiten, statt nur die
 * erste zu prüfen (Korrektheit vor Effizienz: ein übersehener offener Antrag
 * wäre ein Compliance-Risiko).
 */
export async function fetchOffenerShredAntrag(endkundeId: string): Promise<ShredAntrag | null> {
  let cursor: string | undefined;
  let hatWeitereSeite = true;

  while (hatWeitereSeite) {
    const seite = await fetchShredAntraegeSeite(endkundeId, cursor);
    const offenerAntrag = seite.daten.find((antrag) => antrag.status === 'beantragt');
    if (offenerAntrag !== undefined) {
      return offenerAntrag;
    }
    cursor = seite.seite.naechsterCursor ?? undefined;
    hatWeitereSeite = cursor !== undefined;
  }

  return null;
}

/**
 * `operationId: shredAntragFreigeben` — Vier-Augen-Freigabe (ADR-0009 §2.2/
 * §2.4), NUR durch eine ZWEITE Person (`sub` ≠ Antragsteller, sonst 403
 * `vier_augen_selbstfreigabe_verboten`). Löst ATOMAR die tatsächliche
 * Krypto-Löschung aus — das ist der einzige noch verbliebene UNWIDERRUFLICHE
 * Schritt des gesamten Workflows.
 */
export async function postShredAntragFreigeben(
  endkundeId: string,
  antragId: string,
  input: ShredFreigebenAnweisung,
  idempotencyKey: string,
): Promise<ShredFreigebenErgebnis> {
  const { data, error } = await apiClient.POST('/stammdaten/endkunden/{endkundeId}/shred-antraege/{antragId}/freigeben', {
    params: { path: { endkundeId, antragId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `operationId: shredAntragAblehnen` — Vier-Augen-Ablehnung (terminal), NUR
 * durch eine ZWEITE Person (identisches Selbst-Freigabe-Verbot wie
 * `postShredAntragFreigeben`). Der Antragsteller kann danach erneut
 * beantragen.
 */
export async function postShredAntragAblehnen(
  endkundeId: string,
  antragId: string,
  input: ShredAblehnenAnweisung,
  idempotencyKey: string,
): Promise<ShredAntrag> {
  const { data, error } = await apiClient.POST('/stammdaten/endkunden/{endkundeId}/shred-antraege/{antragId}/ablehnen', {
    params: { path: { endkundeId, antragId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * Art. 18 Abs. 3 DSGVO — Unterrichtung dokumentieren (Schritt 1 von 2,
 * ADR-0007 A11.10). Ohne diesen Schritt lehnt der Server die Aufhebung ab.
 */
export async function postEndkundeUnterrichtung(
  endkundeId: string,
  input: EinschraenkungUnterrichtung,
  idempotencyKey: string,
): Promise<EndkundeDetail> {
  const { data, error } = await apiClient.POST('/stammdaten/endkunden/{endkundeId}/einschraenkung-unterrichtung', {
    params: { path: { endkundeId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** Aufhebung der Einschränkung (Schritt 2). Fail-closed ohne Schritt 1. */
export async function postEndkundeEntsperren(endkundeId: string, idempotencyKey: string): Promise<EndkundeDetail> {
  const { data, error } = await apiClient.POST('/stammdaten/endkunden/{endkundeId}/entsperren', {
    params: { path: { endkundeId }, header: { 'Idempotency-Key': idempotencyKey } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
