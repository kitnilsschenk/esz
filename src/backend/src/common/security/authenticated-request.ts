import type { Request } from 'express';
import type { SecurityContext } from './security-context';

/**
 * Express-`Request`-Erweiterung um den vom `JwtAuthGuard` gesetzten
 * `securityContext` und eine (optionale) Request-Korrelations-ID für den
 * Audit-Envelope (ADR-0003 §14.2 — eine Tx = eine Lane = ein Lock).
 *
 * `securityContext` ist auf `@Public()`-Routen `undefined` (Guard läuft dort
 * kurzschließend durch, OHNE Token-Validierung — s. `JwtAuthGuard`).
 */
export interface AuthenticatedRequest extends Request {
  securityContext?: SecurityContext;
  korrelationsId?: string;
  /**
   * ADR-0008 §22 (D10) — vom `SyntheticOnlyInterceptor` auf PII-Schreibrouten
   * gesetzt, WENN `EDMS_SYNTHETIC_ONLY=true` (Default). Von den betroffenen
   * `@AuditAction`-`kontextExtractors` als `kontext.synthetic` (PFLICHT-Tag)
   * ausgelesen — s. `stammdaten/synthetic/synthetic-only.interceptor.ts`.
   */
  synthetic?: boolean;
  /**
   * Nutzerportal (V0066): vom `PortalAuthGuard` aus der Sitzung gesetzt —
   * NIEMALS aus Client-Input (dieselbe rote Linie 1 wie bei
   * `securityContext`).
   *
   * Bewusst ein EIGENES Feld und nicht `securityContext`: Ein Endkunde hat
   * keine Betriebsrolle, keine ABAC-Fachaktion und kein Keycloak-Token. Ihn
   * in denselben Slot zu legen hiesse, dass jede Stelle, die heute
   * `securityContext` prueft, stillschweigend auch fuer Endkunden gilt —
   * und genau das darf nicht passieren.
   */
  portalKunde?: PortalKunde;
}

/** Der angemeldete Endkunde einer Portal-Sitzung. */
export interface PortalKunde {
  readonly zugangId: string;
  readonly endkundeId: string;
  readonly kennung: string;
}
