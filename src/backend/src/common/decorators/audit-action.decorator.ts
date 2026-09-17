import { SetMetadata } from '@nestjs/common';
import type { AuditErgebnis } from '../security/audit-ergebnis';
import type { AuthenticatedRequest } from '../security/authenticated-request';

export const AUDIT_ACTION_KEY = 'auditAction';

/** Skalare, JSONB-kompatible Kontext-Werte (rote Linie 1 — keine Objekte/Arrays). */
export type AuditKontextValue = string | number | boolean | null;

/**
 * Extraktions-Kontext für `@AuditAction`-Extraktor-Funktionen. Bewusst
 * `request`/`result`/`error` als benannte, typisierte Felder statt eines
 * rohen Handler-`args`-Tupels (`ExecutionContext.getArgs()` liefert bei HTTP
 * ohnehin nur `[req, res, next]`, nicht die pipe-aufgelösten DTOs) — jede
 * Extraktor-Funktion liest gezielt aus `request.params`/`.query`/`.body`
 * bzw. aus `result`, NIE über generische String-Bracket-Indizierung auf
 * unbekannte Objekte (rote Linie 2, `backend-lead`-Votum 3).
 */
export interface AuditExtractionContext<TResult = unknown> {
  readonly request: AuthenticatedRequest;
  readonly result: TResult | undefined;
  readonly error: unknown;
}

export type AuditObjektRefExtractor<TResult = unknown> = (
  ctx: AuditExtractionContext<TResult>,
) => string | undefined;

export type AuditKontextExtractor<TResult = unknown> = (
  ctx: AuditExtractionContext<TResult>,
) => AuditKontextValue | undefined;

export interface AuditActionMetadata<TResult = unknown> {
  /** Katalog-`event_typ` (Build-/Lint-Check gegen den Katalog folgt separat, M5). */
  readonly eventTyp: string;
  /** Leitet `objekt_ref` (Pseudonym/Entity-UUID) typisiert aus Request/Ergebnis ab. */
  readonly objektRefExtractor?: AuditObjektRefExtractor<TResult>;
  /**
   * Ergebnis-Mapping bei Fehlern. Default: `ForbiddenException` -> `denied`,
   * alles andere -> `error` (s. `AuditActionInterceptor.resolveErgebnis`).
   */
  readonly ergebnisMapping?: (error: unknown) => AuditErgebnis;
  /** Whitelist-Kontext-Extraktoren, Keys MÜSSEN Teilmenge der Katalog-Whitelist sein. */
  readonly kontextExtractors?: Readonly<Record<string, AuditKontextExtractor<TResult>>>;
}

/**
 * Markiert eine state-ändernde Controller-Methode als audit-pflichtig
 * (ADR-0003 §17.2, ADR-0002 §15). Wird vom global registrierten
 * `AuditActionInterceptor` ausgewertet — Methoden OHNE diesen Decorator
 * werden vom Interceptor unverändert durchgereicht (Login/Callback/Refresh/
 * Logout sind eine DOKUMENTIERTE AUSNAHME und rufen `AuditService.append()`
 * direkt auf, `backend-lead`-Votum F2).
 */
export function AuditAction<TResult = unknown>(metadata: AuditActionMetadata<TResult>): MethodDecorator {
  return SetMetadata(AUDIT_ACTION_KEY, metadata);
}
