/**
 * Eigenes, schlankes Cursor-Schema für Messkonzept-Versionen: die Liste ist
 * "neueste zuerst" (`ORDER BY version_nr DESC`, Contract-Vorgabe) — der
 * generische `createdAt+id`-Cursor (`persistence/cursor.util.ts`) passt
 * hier nicht (andere Sortierrichtung/-spalte). Opaker Cursor = Base64url(
 * JSON({versionNr})).
 */
export function encodeVersionCursor(versionNr: number): string {
  return Buffer.from(JSON.stringify({ versionNr }), 'utf8').toString('base64url');
}

export function decodeVersionCursor(cursor: string): number | undefined {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) {
      return undefined;
    }
    const versionNr = (parsed as Record<string, unknown>)['versionNr'];
    return typeof versionNr === 'number' ? versionNr : undefined;
  } catch {
    return undefined;
  }
}
