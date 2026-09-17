import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMesskanaeleListeView } from './useMesskanaeleListeView';

const { useMesskanaeleListeMock, useZaehlerFreshnessMock } = vi.hoisted(() => ({
  useMesskanaeleListeMock: vi.fn(),
  useZaehlerFreshnessMock: vi.fn(),
}));

vi.mock('../../api/messkanal', () => ({ useMesskanaeleListe: useMesskanaeleListeMock }));
vi.mock('../../api/zaehler', () => ({ useZaehlerFreshness: useZaehlerFreshnessMock }));

const ZAEHLER_ID = '0198c3aa-aaaa-7000-8000-000000000001';
const MESSKANAL_ID = '0198c3aa-bbbb-7000-8000-000000000002';

function mockListe(): void {
  useMesskanaeleListeMock.mockReturnValue({
    data: { pages: [{ daten: [], seite: { naechsterCursor: null } }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  });
}

describe('useMesskanaeleListeView', () => {
  afterEach(() => {
    useMesskanaeleListeMock.mockReset();
    useZaehlerFreshnessMock.mockReset();
  });

  it('joint Freshness-Einträge über `messkanalId` — „vor X …"-Text für einen bereits empfangenen Kanal', () => {
    mockListe();
    useZaehlerFreshnessMock.mockReturnValue({
      data: [{ messkanalId: MESSKANAL_ID, letzteUebertragung: '2026-07-21T00:00:00.000Z', ueberfaellig: false, ausfallStatus: null, ausfallSeit: null }],
      isPending: false,
      isError: false,
    });

    const { result } = renderHook(() => useMesskanaeleListeView(ZAEHLER_ID));

    const freshness = result.current.freshnessFuer(MESSKANAL_ID);
    expect(freshness).toBeDefined();
    expect(freshness?.ueberfaellig).toBe(false);
    expect(freshness?.label).not.toBe('');
  });

  it('zeigt „noch nie empfangen" für einen Kanal ohne jede Übertragung', () => {
    mockListe();
    useZaehlerFreshnessMock.mockReturnValue({
      data: [{ messkanalId: MESSKANAL_ID, letzteUebertragung: null, ueberfaellig: true, ausfallStatus: null, ausfallSeit: null }],
      isPending: false,
      isError: false,
    });

    const { result } = renderHook(() => useMesskanaeleListeView(ZAEHLER_ID));

    const freshness = result.current.freshnessFuer(MESSKANAL_ID);
    expect(freshness?.label).toBe('Noch nie empfangen');
    expect(freshness?.ueberfaellig).toBe(true);
  });

  it('liefert `undefined`, solange die Freshness-Nebenabfrage noch keine Daten für diesen Kanal hat', () => {
    mockListe();
    useZaehlerFreshnessMock.mockReturnValue({ data: [], isPending: false, isError: false });

    const { result } = renderHook(() => useMesskanaeleListeView(ZAEHLER_ID));

    expect(result.current.freshnessFuer(MESSKANAL_ID)).toBeUndefined();
  });
});
