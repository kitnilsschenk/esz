import { createHash } from 'node:crypto';

/**
 * SHA-256-Hexdigest des Datei-Inhalts einer Migration. Dient der
 * Integritäts-Prüfung in `schema_migrations` (Checksum-Drift-Erkennung,
 * ADR-0001 §10.4 (b)).
 */
export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
