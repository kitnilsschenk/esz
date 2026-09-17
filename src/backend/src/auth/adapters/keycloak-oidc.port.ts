import type { KeycloakIdTokenClaims } from '../jwt/keycloak-claims';

export interface AuthorizationRequestParams {
  readonly state: string;
  readonly nonce: string;
  readonly codeChallenge: string;
}

export interface TokenExchangeResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly idTokenClaims: KeycloakIdTokenClaims;
  readonly expiresIn: number;
}

export const KEYCLOAK_OIDC_PORT = Symbol('KEYCLOAK_OIDC_PORT');

/**
 * Port für den Keycloak-Token-/Autorisierungs-Endpoint (ADR-0002 Teil B §12
 * Schicht-Split, `backend-lead`-Votum F1: `AuthController` -> `AuthService`
 * -> `KeycloakOidcAdapter`). Der `AuthService` kennt NUR diesen Port, nie
 * `fetch`/Keycloak-URLs direkt (`.claude/rules/backend-nestjs.md`: "Kein
 * direkter Aufruf von Fremdsystemen ohne Adapter/Port").
 *
 * Bewusst als funktionswertige PROPERTIES (statt Methoden-Kurzschreibweise)
 * deklariert: ein Port hat per Definition keine `this`-abhängige Semantik,
 * und diese Schreibweise vermeidet `@typescript-eslint/unbound-method`-
 * Rauschen an jeder Stelle, an der Tests einzelne Port-Methoden mocken
 * (`expect(oidc.exchangeAuthorizationCode).toHaveBeenCalledWith(...)`) —
 * kein Unterdrücken der Regel, sondern die von ihr empfohlene Modellierung
 * für Callback-/Port-Verträge ohne `this`-Bindung.
 */
export interface KeycloakOidcPort {
  readonly buildAuthorizationUrl: (params: AuthorizationRequestParams) => string;
  readonly exchangeAuthorizationCode: (code: string, codeVerifier: string) => Promise<TokenExchangeResult>;
  readonly refreshAccessToken: (refreshToken: string) => Promise<TokenExchangeResult>;
  readonly endSession: (refreshToken: string) => Promise<void>;
}

/** Code-Exchange/Refresh gegen Keycloak fehlgeschlagen (4xx vom Token-Endpoint, ungültige ID-Token-Signatur, ...). */
export class OidcExchangeError extends Error {}

/** Keycloak (Token-/Logout-Endpoint) war nicht erreichbar oder antwortete mit 5xx. */
export class OidcProviderUnavailableError extends Error {}
