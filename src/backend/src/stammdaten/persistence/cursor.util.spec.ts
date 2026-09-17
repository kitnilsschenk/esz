import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, paginate } from './cursor.util';

describe('cursor.util (Cursor-Pagination, api-contracts.md)', () => {
  it('encodeCursor/decodeCursor sind Roundtrip-stabil', () => {
    const payload = { createdAt: '2026-07-01T00:00:00.000Z', id: 'a1b2c3' };
    const cursor = encodeCursor(payload);

    expect(decodeCursor(cursor)).toEqual(payload);
  });

  it('decodeCursor liefert undefined bei kaputtem/fremdem Cursor (kein Absturz)', () => {
    expect(decodeCursor('nicht-base64!!!')).toBeUndefined();
    expect(decodeCursor(Buffer.from('{"nurEinFeld":1}').toString('base64url'))).toBeUndefined();
  });

  it('paginate() liefert alle Zeilen + null-Cursor, wenn weniger als limit+1 Zeilen vorliegen (letzte Seite)', () => {
    const rows = [
      { id: '1', createdAt: '2026-07-01T00:00:00.000Z' },
      { id: '2', createdAt: '2026-07-02T00:00:00.000Z' },
    ];

    const result = paginate(rows, 50);

    expect(result.daten).toHaveLength(2);
    expect(result.naechsterCursor).toBeNull();
  });

  it('paginate() kappt auf limit + liefert einen Cursor, wenn eine weitere Seite existiert', () => {
    const rows = [
      { id: '1', createdAt: '2026-07-01T00:00:00.000Z' },
      { id: '2', createdAt: '2026-07-02T00:00:00.000Z' },
      { id: '3', createdAt: '2026-07-03T00:00:00.000Z' },
    ];

    const result = paginate(rows, 2);

    expect(result.daten).toHaveLength(2);
    expect(result.daten.map((r) => r.id)).toEqual(['1', '2']);
    expect(result.naechsterCursor).not.toBeNull();
    expect(decodeCursor(result.naechsterCursor ?? '')).toEqual({ createdAt: '2026-07-02T00:00:00.000Z', id: '2' });
  });
});
