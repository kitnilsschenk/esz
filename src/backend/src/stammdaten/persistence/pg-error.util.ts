/**
 * TypeORMs `QueryFailedError` kopiert alle Eigenschaften des zugrunde
 * liegenden `pg`-Fehlers (u. a. `code`) auf sich selbst (s.
 * `typeorm/error/QueryFailedError.js`) — diese Hilfsfunktion prüft den
 * PG-Fehlercode, OHNE `any` zu verwenden (Type-Guard statt Cast).
 */
export function hatPgErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code: unknown }).code === code
  );
}
