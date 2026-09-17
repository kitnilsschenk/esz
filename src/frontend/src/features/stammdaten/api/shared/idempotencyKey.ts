/**
 * Erzeugt einen Client-seitigen Idempotenz-Schlüssel für schreibende
 * Stammdaten-Operationen (`Idempotency-Key`-Header, Pflicht auf jedem
 * POST/PATCH/DELETE — `schemas/openapi/stammdaten.openapi.yaml`,
 * `.claude/rules/api-contracts.md`). UUID v4 über die Web-Crypto-API
 * (`crypto.randomUUID`) — keine neue Dependency, im Browser wie in jsdom
 * (Test-Umgebung) verfügbar.
 */
export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}
