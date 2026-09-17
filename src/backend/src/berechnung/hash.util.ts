import { createHash } from 'node:crypto';

/**
 * Kanonisierungs-/Siegel-Helfer (B2.3, `parameter_hash`/`rohdaten_hash`).
 * Der Aufrufer stellt bereits GEORDNETE, deterministisch serialisierte
 * Zeilen bereit (`\n`-Join) — diese Funktion selbst sortiert NICHT (Ordnung
 * ist fachliche Aufrufer-Verantwortung, z. B. "sortiert nach Tag/Kanal").
 */
export function sha256Canonical(zeilen: readonly string[]): Buffer {
  return createHash('sha256').update(zeilen.join('\n'), 'utf8').digest();
}

/**
 * SHA-256 ueber einen BINAERINHALT.
 *
 * Getrennt von `sha256Canonical()`, weil dort die Kanonisierung der Kern der
 * Zusage ist (Zeilen, `\n`-verbunden, UTF-8). Ein Buffer hat keine
 * Zeilenstruktur — ihn durch dieselbe Funktion zu schicken haette den
 * Eindruck erweckt, es fände eine Kanonisierung statt, die es nicht gibt.
 * Die Determinismus-Zusage liegt beim ERZEUGER des Buffers (s.
 * `zip-schreiber.util.ts`: feste Zeitstempel).
 */
export function sha256Binaer(inhalt: Buffer): Buffer {
  return createHash('sha256').update(inhalt).digest();
}
