import type { JWTPayload } from 'jose';

export interface KeycloakRealmAccess {
  readonly roles?: readonly string[];
}

export interface KeycloakResourceAccessEntry {
  readonly roles?: readonly string[];
}

/**
 * Getypte Sicht auf die für EDMS relevanten Keycloak-Access-/ID-Token-Claims
 * (ADR-0002 Teil B §11/§14; `deployment/keycloak/realm-edms.json`). Bewusst
 * KEIN generischer `Record<string, unknown>`-Zugriff (rote Linie 2,
 * `backend-lead`-Votum 3 — typisierte Extraktion statt String-Keys).
 */
export interface KeycloakAccessTokenClaims extends JWTPayload {
  // `sub` ist bereits Teil von `JWTPayload` (registrierter RFC-7519-Claim) —
  // hier zusätzlich EXPLIZIT redeklariert, damit dieses Modul unabhängig von
  // der `jose`-Typauflösung self-contained bleibt (Redeklaration mit
  // identischem Typ ist zulässig und ändert die effektive Struktur nicht).
  readonly sub?: string;
  readonly realm_access?: KeycloakRealmAccess;
  readonly resource_access?: Readonly<Record<string, KeycloakResourceAccessEntry>>;
  /** Hardcoded-Claim-Mapper je Client (`security-lead`-Votum 2) — 'benutzer' | 'dienstkonto'. */
  readonly actor_typ?: string;
  /** Authorized Party — der Client, dem das Token ausgestellt wurde. */
  readonly azp?: string;
  readonly typ?: string;
}

export interface KeycloakIdTokenClaims extends JWTPayload {
  readonly sub?: string;
  readonly nonce?: string;
  readonly azp?: string;
}
