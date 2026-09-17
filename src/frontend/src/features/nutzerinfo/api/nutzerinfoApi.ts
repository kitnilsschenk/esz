// Einzige Stelle, die fuer den Nutzerinfo-Kontext `apiClient.*` aufruft
// (`.claude/rules/frontend-react.md`).

import {
  apiClient,
  toApiProblemError,
  type Nutzerinformation,
  type NutzerinfoBericht,
  type NutzerinfoLauf,
  type NutzerinfoLaufErgebnis,
  type NutzerinfoMonatsstand,
  type NutzerinfoSammelZustellung,
  type NutzerinfoSammelZustellungErgebnis,
  type NutzerinfoZustellung,
} from '@edms/shared';

/** `GET /nutzerinfo/informationen` — der Verlauf EINES Endkunden. */
export async function fetchInformationen(
  endkundeId: string,
  limit?: number,
): Promise<readonly Nutzerinformation[]> {
  const { data, error } = await apiClient.GET('/nutzerinfo/informationen', {
    params: { query: limit === undefined ? { endkundeId } : { endkundeId, limit } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /nutzerinfo/informationen/{id}/bericht` — was der Endkunde zu sehen bekommt. */
export async function fetchBericht(informationId: string): Promise<NutzerinfoBericht> {
  const { data, error } = await apiClient.GET('/nutzerinfo/informationen/{informationId}/bericht', {
    params: { path: { informationId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `GET /nutzerinfo/status` — „Ist der Monat durch?"
 *
 * Ohne `monat` bestimmt der SERVER den letzten abgeschlossenen Monat und
 * nennt ihn in der Antwort. Die Oberflaeche rechnet ihn bewusst nicht selbst
 * aus: Welcher Monat zaehlt, haengt an der Zeitzone, und zwei Rechnungen
 * derselben Sache laufen frueher oder spaeter auseinander.
 */
export async function fetchMonatsstand(monat?: string): Promise<NutzerinfoMonatsstand> {
  const { data, error } = await apiClient.GET('/nutzerinfo/status', {
    params: { query: monat === undefined ? {} : { monat } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /nutzerinfo/laeufe` — Erzeugungslauf fuer einen abgeschlossenen Monat. */
export async function starteLauf(
  input: NutzerinfoLauf,
  idempotencyKey: string,
): Promise<NutzerinfoLaufErgebnis> {
  const { data, error } = await apiClient.POST('/nutzerinfo/laeufe', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /nutzerinfo/informationen/{id}/zustellung` — Versandnachweis nachtragen. */
export async function vermerkeZustellung(
  informationId: string,
  input: NutzerinfoZustellung,
  idempotencyKey: string,
): Promise<Nutzerinformation> {
  const { data, error } = await apiClient.POST('/nutzerinfo/informationen/{informationId}/zustellung', {
    params: { path: { informationId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `GET /nutzerinfo/informationen/{id}/dokument` — das druckfertige
 * Kundendokument.
 *
 * `parseAs: 'text'`, weil die Antwort HTML ist und kein JSON. Der Abruf läuft
 * über den regulären Client und nicht über einen `<a href>`: die Route
 * verlangt `Authorization: Bearer`, und eine Browser-Navigation schickt den
 * Header nicht mit (s. `dateiDownload.ts`).
 */
export async function fetchNutzerinfoDokument(informationId: string): Promise<string> {
  const { data, error } = await apiClient.GET('/nutzerinfo/informationen/{informationId}/dokument', {
    params: { path: { informationId } },
    parseAs: 'text',
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /nutzerinfo/dokumente` — die Versandmappe eines ganzen Monats. */
export async function fetchNutzerinfoMonatsmappe(monat: string): Promise<string> {
  const { data, error } = await apiClient.GET('/nutzerinfo/dokumente', {
    params: { query: { monat } },
    parseAs: 'text',
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /nutzerinfo/zustellungen` — Versandnachweis für einen ganzen Monat. */
export async function vermerkeSammelZustellung(
  input: NutzerinfoSammelZustellung,
  idempotencyKey: string,
): Promise<NutzerinfoSammelZustellungErgebnis> {
  const { data, error } = await apiClient.POST('/nutzerinfo/zustellungen', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
