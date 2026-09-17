import type { Request } from 'express';

/**
 * ADR-0005 §26.4 SEC-5 — liest `zweck`/`ticketRef` aus dem ROHEN Request-
 * Body (analog `zugriffszweck.util.ts`s Header-Extraktion): Express'
 * JSON-Body-Parser-Middleware läuft VOR dem gesamten Nest-Request-
 * Lifecycle, `request.body` ist zum Zeitpunkt der `PolicyInterceptor`-
 * Auswertung also bereits geparst (aber NOCH NICHT durch die
 * `ValidationPipe`/DTO-Transformation gelaufen — die läuft erst NACH den
 * Interceptors). Reine STRUKTUR-Extraktion (Separation of Concerns: der
 * Provider zieht Ressourcen-Attribute, der PDP entscheidet über
 * Whitelist/Format, `InCodePolicyAdapter.evaluateGeraetReverse()`) — die
 * DTO (`GeraetReverseAufloesungDto`) validiert dieselben Felder UNABHÄNGIG
 * davon nochmals strukturell (400 statt 403 bei rein syntaktisch
 * fehlerhaftem Body), Defense-in-Depth, kein Widerspruch.
 *
 * WICHTIG (Praezisions-Fix): `zweck`/`ticketRef` sind BEIDE optional — ein
 * Body, der NUR eines der beiden Felder traegt (z. B. gueltiger `zweck`,
 * aber fehlendes `ticketRef`), MUSS als "Reverse-Aufloesungs-Versuch mit
 * unvollstaendigen Daten" erkannt werden (-> PDP liefert den PRAEZISEN
 * Deny-Grund `geraet_reverse_ticket_fehlt`), NICHT pauschal als "kein
 * Aufloesungs-Versuch" (-> geraetReverse komplett `undefined` -> PDP
 * liefert faelschlich `geraet_reverse_zweck_fehlt`, obwohl der Zweck
 * eigentlich gueltig war). Erkennungsmerkmal "ist dies ein
 * Reverse-Aufloesungs-Versuch": mindestens EINER der beiden Schluessel
 * (`zweck`/`ticketRef`) ist im Body vorhanden — die PATCH-Route
 * (`{aktion:'deaktivieren'}`) traegt strukturell KEINEN der beiden
 * Schluessel, daher bleibt die Quota-Abfrage dort weiterhin ausgespart.
 */
export interface GeraetReverseZugriffAttribut {
  readonly zweck?: string;
  readonly ticketRef?: string;
}

export function extractBodyString(body: unknown, key: string): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

export function extractGeraetReverseZugriff(request: Request): GeraetReverseZugriffAttribut | undefined {
  const body = request.body as unknown;
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const traegtZweckSchluessel = 'zweck' in (body as Record<string, unknown>);
  const traegtTicketSchluessel = 'ticketRef' in (body as Record<string, unknown>);
  if (!traegtZweckSchluessel && !traegtTicketSchluessel) {
    return undefined;
  }

  const zweck = extractBodyString(body, 'zweck');
  const ticketRef = extractBodyString(body, 'ticketRef');

  // `exactOptionalPropertyTypes: true` — nur setzen, wenn tatsaechlich ein
  // String vorliegt (kein explizites `zweck: undefined`).
  return {
    ...(zweck !== undefined ? { zweck } : {}),
    ...(ticketRef !== undefined ? { ticketRef } : {}),
  };
}
