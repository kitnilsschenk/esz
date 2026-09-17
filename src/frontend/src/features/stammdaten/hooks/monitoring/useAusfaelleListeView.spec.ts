import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAusfaelleListeView } from './useAusfaelleListeView';

const { useAusfaelleListeMock } = vi.hoisted(() => ({ useAusfaelleListeMock: vi.fn() }));

vi.mock('../../api/monitoring', () => ({ useAusfaelleListe: useAusfaelleListeMock }));

describe('useAusfaelleListeView', () => {
  afterEach(() => {
    useAusfaelleListeMock.mockReset();
  });

  it('flacht die paginierten Seiten zu EINER Item-Liste ab', () => {
    useAusfaelleListeMock.mockReturnValue({
      data: {
        pages: [
          { daten: [{ messkanalId: 'a', zaehlerId: 'b', letzteUebertragung: '2026-07-18T00:00:00.000Z', ueberfaellig: true, ausfallStatus: null, ausfallSeit: null }], seite: { naechsterCursor: 'c1' } },
          { daten: [{ messkanalId: 'c', zaehlerId: 'd', letzteUebertragung: '2026-07-17T00:00:00.000Z', ueberfaellig: true, ausfallStatus: 'offen', ausfallSeit: '2026-07-17T00:00:00.000Z' }], seite: { naechsterCursor: null } },
        ],
      },
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });

    const { result } = renderHook(() => useAusfaelleListeView());

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items.map((item) => item.messkanalId)).toEqual(['a', 'c']);
  });

  it('liefert eine leere Liste, solange keine Daten vorhanden sind', () => {
    useAusfaelleListeMock.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });

    const { result } = renderHook(() => useAusfaelleListeView());

    expect(result.current.items).toHaveLength(0);
    expect(result.current.isPending).toBe(true);
  });
});
