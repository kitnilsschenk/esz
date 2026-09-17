// Einzige Stelle, die fuer den Portal-Kontext `apiClient.*` aufruft
// (`.claude/rules/frontend-react.md`).
//
// Kein Aufruf hier uebergibt eine Endkunden-Kennung — nicht im Pfad, nicht im
// Body, nicht als Query. Der Server nimmt sie ausschliesslich aus der
// Sitzung. Das ist keine Bequemlichkeit, sondern die Eigenschaft, die den
// Blick in fremde Verbrauchsdaten unmoeglich macht: Es gibt keinen Parameter,
// den man aendern koennte.
//
// Die Portal-Routen tragen KEINEN `Authorization`-Header (s. `client.ts`,
// `PORTAL_KUNDE_PREFIX`) — sie laufen ueber das `__Host-edms_portal`-Cookie.

import {
  apiClient,
  toApiProblemError,
  type NutzerinfoBericht,
  type Nutzerinformation,
  type PortalAnmeldungAntwort,
  type PortalAnmeldungEingabe,
  type PortalEinloesenEingabe,
  type PortalIch,
  type PortalWiderspruchStand,
  type PortalZugangAusgabe,
  type PortalZugangStand,
} from '@edms/shared';

/** `POST /portal/auth/einloesen` — Code aus dem Brief, Passwort setzen, angemeldet. */
export async function loeseZugangEin(eingabe: PortalEinloesenEingabe): Promise<PortalAnmeldungAntwort> {
  const { data, error } = await apiClient.POST('/portal/auth/einloesen', { body: eingabe });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /portal/auth/anmeldung` — der regulaere Weg nach dem ersten Einloesen. */
export async function meldeAn(eingabe: PortalAnmeldungEingabe): Promise<PortalAnmeldungAntwort> {
  const { data, error } = await apiClient.POST('/portal/auth/anmeldung', { body: eingabe });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /portal/auth/abmeldung` — idempotent, auch mit abgelaufener Sitzung. */
export async function meldeAb(): Promise<void> {
  const { error } = await apiClient.POST('/portal/auth/abmeldung', {});
  if (error) {
    throw toApiProblemError(error);
  }
}

/** `GET /portal/auth/ich` — die Probe, dass die Sitzung traegt. */
export async function fetchIch(): Promise<PortalIch> {
  const { data, error } = await apiClient.GET('/portal/auth/ich', {});
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /portal/informationen` — der eigene Verlauf, neueste zuerst. */
export async function fetchEigeneInformationen(): Promise<readonly Nutzerinformation[]> {
  const { data, error } = await apiClient.GET('/portal/informationen', {});
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /portal/informationen/{id}/bericht` — dieselben Zahlen, die der Betrieb sieht. */
export async function fetchEigenenBericht(informationId: string): Promise<NutzerinfoBericht> {
  const { data, error } = await apiClient.GET('/portal/informationen/{informationId}/bericht', {
    params: { path: { informationId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /portal/informationen/{id}/dokument` — dasselbe Blatt, das auch per Post ginge. */
export async function fetchEigenesDokument(informationId: string): Promise<string> {
  const { data, error } = await apiClient.GET('/portal/informationen/{informationId}/dokument', {
    params: { path: { informationId } },
    parseAs: 'text',
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `GET /portal/widerspruch` — steht ein Opt-out? */
export async function fetchWiderspruchStand(): Promise<PortalWiderspruchStand> {
  const { data, error } = await apiClient.GET('/portal/widerspruch', {});
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `POST /portal/widerspruch` — das digitale Opt-out (TB-06).
 *
 * Ohne Body: Der Zweck steht fest, und der Zeitpunkt ist jetzt. Zeitpunkt und
 * IP haelt der Server als Beleg fest (DS-03) — beides aus der Verbindung, nicht
 * aus dem Client: Eine vom Browser gelieferte IP waere kein Nachweis.
 */
export async function widersprich(): Promise<PortalWiderspruchStand> {
  const { data, error } = await apiClient.POST('/portal/widerspruch', {});
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST /portal/widerspruch/ruecknahme` — der Kunde will wieder informiert werden. */
export async function nimmWiderspruchZurueck(): Promise<PortalWiderspruchStand> {
  const { data, error } = await apiClient.POST('/portal/widerspruch/ruecknahme', {});
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/* --- Betriebssicht: die Zugangsvergabe (Rollen + ABAC, Bearer) --- */

/** `GET /stammdaten/endkunden/{id}/portal-zugang` — der Stand, OHNE Code. */
export async function fetchZugangStand(endkundeId: string): Promise<PortalZugangStand> {
  const { data, error } = await apiClient.GET('/stammdaten/endkunden/{endkundeId}/portal-zugang', {
    params: { path: { endkundeId } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/**
 * `POST .../portal-zugang/codes` — der EINZIGE Moment, in dem der Code im
 * Klartext existiert.
 *
 * Die Antwort enthaelt ihn samt fertigem Brief genau einmal. Sie wird
 * bewusst NICHT im Query-Cache abgelegt: Ein Zugangscode, der in einem Cache
 * liegt, ist ein Zugangscode, der laenger existiert als noetig.
 */
export async function gibZugangscodeAus(endkundeId: string, idempotencyKey: string): Promise<PortalZugangAusgabe> {
  const { data, error } = await apiClient.POST('/stammdaten/endkunden/{endkundeId}/portal-zugang/codes', {
    params: { path: { endkundeId }, header: { 'Idempotency-Key': idempotencyKey } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}

/** `POST .../portal-zugang/sperre` — sperrt und beendet alle offenen Sitzungen. */
export async function sperreZugang(endkundeId: string, idempotencyKey: string): Promise<PortalZugangStand> {
  const { data, error } = await apiClient.POST('/stammdaten/endkunden/{endkundeId}/portal-zugang/sperre', {
    params: { path: { endkundeId }, header: { 'Idempotency-Key': idempotencyKey } },
  });
  if (error) {
    throw toApiProblemError(error);
  }
  return data;
}
