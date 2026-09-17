import type { AppRole } from './app-role';
import type { TokenActorTyp } from './actor-typ';

/**
 * Sicherheitskontext eines Requests — AUSSCHLIESSLICH vom `JwtAuthGuard` nach
 * vollständiger Token-Validierung befüllt (rote Linie 1, ADR-0002 §11).
 * Niemals aus Client-Input konstruiert.
 */
export interface SecurityContext {
  /** Opake Keycloak-Principal-ID (`sub`). Kein Klartext-Name, kein FK. */
  readonly sub: string;
  readonly actorTyp: TokenActorTyp;
  /** Gemappte interne Rollen (RolesMapperService), unbekannte Realm-Rollen verworfen. */
  readonly roles: readonly AppRole[];
  /** Authorized Party (Keycloak `azp`) — der Client, der das Token erhalten hat. */
  readonly azp: string;
}
