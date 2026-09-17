/**
 * Cursor-Pagination (api-contracts.md: "Cursor-basiert, niemals offset").
 * Opaker Cursor = Base64url(JSON({createdAt, id})) über eine stabile
 * `ORDER BY created_at ASC, id ASC`-Reihenfolge — konsistent über alle
 * Stammdaten-Listen-Endpoints hinweg (ein Encoder/Decoder für alle Repos).
 */
export interface CursorPayload {
  readonly createdAt: string;
  readonly id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload | undefined {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);

    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }

    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate['createdAt'] !== 'string' || typeof candidate['id'] !== 'string') {
      return undefined;
    }

    return { createdAt: candidate['createdAt'], id: candidate['id'] };
  } catch {
    return undefined;
  }
}

export interface PaginatedResult<T> {
  readonly daten: T[];
  readonly naechsterCursor: string | null;
}

interface CursorableRow {
  readonly createdAt: string;
  readonly id: string;
}

/**
 * Erwartet, dass `rows` mit `LIMIT limit + 1` geladen wurde (Look-ahead-
 * Muster) — liefert genau `limit` Einträge + den Cursor auf den letzten
 * zurückgegebenen Eintrag, NUR wenn eine weitere Seite existiert (sonst
 * `null`).
 */
export function paginate<T extends CursorableRow>(rows: readonly T[], limit: number): PaginatedResult<T> {
  if (rows.length > limit) {
    const daten = rows.slice(0, limit);
    const letzter = daten[daten.length - 1];
    const naechsterCursor = letzter === undefined ? null : encodeCursor({ createdAt: letzter.createdAt, id: letzter.id });
    return { daten, naechsterCursor };
  }

  return { daten: [...rows], naechsterCursor: null };
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
