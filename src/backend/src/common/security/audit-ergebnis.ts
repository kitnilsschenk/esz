/**
 * Ergebnis-Enum für den Audit-Envelope (ADR-0003 §13.1 `ergebnis`, DB-CHECK
 * `ck_event_ergebnis`). Zentral hier (statt im `audit`-Modul) definiert, weil
 * sowohl der `@AuditAction`-Decorator (`common/decorators`) als auch der
 * `AuditActionInterceptor` und `AuditService` denselben Typ ohne
 * Modul-Rückimport brauchen.
 */
export const AUDIT_ERGEBNISSE = ['ok', 'denied', 'error'] as const;
export type AuditErgebnis = (typeof AUDIT_ERGEBNISSE)[number];
