/**
 * Akteurstyp-Enum (ADR-0003 §13.1 `actor_typ`, DB-CHECK `ck_event_actor_typ`;
 * ADR-0002 Teil B §11 D1, `security-lead`-Votum 2).
 *
 * `benutzer` = menschlicher Login DES BETRIEBS (OIDC-Code-Flow, `edms-bff`), `dienstkonto`
 * = Client-Credentials-Dienstkonto (Persona C), `system` = interner,
 * nicht-HTTP-Emittent (z. B. Auth-Fehlschlag ohne validierten Prinzipal,
 * ADR-0002 §15 Event `auth.anmeldung.fehlschlag`). Der `JwtAuthGuard`
 * akzeptiert aus einem Token AUSSCHLIESSLICH `benutzer`/`dienstkonto`
 * (fail-closed) — `system` ist ein reiner Audit-Envelope-Wert für
 * App-interne Emits ohne Token-Kontext, niemals ein gültiger Token-Claim.
 *
 * `endkunde` (V0067) = ein Endkunde am Nutzerportal, `actor_sub` =
 * `portal.zugang.id`. BEWUSST NICHT unter `benutzer` subsumiert: Ein
 * Mitarbeiter, der Daten verarbeitet, und eine betroffene Person, die ihre
 * eigenen ansieht, sind rechtlich zwei verschiedene Vorgänge — die Antwort
 * „ein Benutzer" auf die Frage „wer war das?" wäre dann mehrdeutig. Wie
 * `system` ist der Wert KEIN gültiger Token-Claim: Ein Endkunde bekommt kein
 * Keycloak-Token, er hat eine Portal-Sitzung.
 */
export const ACTOR_TYPEN = ['benutzer', 'dienstkonto', 'system', 'endkunde'] as const;

export type ActorTyp = (typeof ACTOR_TYPEN)[number];

/** Token-Claim-Enum (rote Linie 1: fehlt/unbekannt -> 401, KEIN `system`). */
export const TOKEN_ACTOR_TYPEN = ['benutzer', 'dienstkonto'] as const;
export type TokenActorTyp = (typeof TOKEN_ACTOR_TYPEN)[number];

export function isTokenActorTyp(value: unknown): value is TokenActorTyp {
  return typeof value === 'string' && (TOKEN_ACTOR_TYPEN as readonly string[]).includes(value);
}

export function isActorTyp(value: unknown): value is ActorTyp {
  return typeof value === 'string' && (ACTOR_TYPEN as readonly string[]).includes(value);
}
