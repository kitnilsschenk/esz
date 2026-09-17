import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EndkundeListItem } from '@edms/shared';
import { useStandortUebersichtView } from './useStandortUebersichtView';

const { useEndkundenListeViewMock } = vi.hoisted(() => ({ useEndkundenListeViewMock: vi.fn() }));

vi.mock('../endkunde', () => ({ useEndkundenListeView: useEndkundenListeViewMock }));

function endkunde(overrides: Partial<EndkundeListItem> = {}): EndkundeListItem {
  return {
    id: '0198c3aa-aaaa-7000-8000-000000000001',
    verarbeitungsStatus: 'aktiv',
    consentStatus: 'fehlt',
    vonWissAuswertungAusgenommen: false,
    endkundengruppe: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockListe(items: readonly EndkundeListItem[], ueberschreibungen: Partial<{ isPending: boolean; isError: boolean; hasNextPage: boolean }> = {}): void {
  useEndkundenListeViewMock.mockReturnValue({
    items,
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    loadMore: vi.fn(),
    ...ueberschreibungen,
  });
}

describe('useStandortUebersichtView', () => {
  afterEach(() => {
    useEndkundenListeViewMock.mockReset();
  });

  it('wählt GENAU EINEN vorhandenen Endkunden automatisch vor — keine sinnlose Ein-Elemente-Auswahl', () => {
    mockListe([endkunde()]);

    const { result } = renderHook(() => useStandortUebersichtView());

    expect(result.current.nurEinEndkunde).toBe(true);
    expect(result.current.ausgewaehlteEndkundeId).toBe('0198c3aa-aaaa-7000-8000-000000000001');
  });

  it('wählt BEI MEHREREN Endkunden NICHTS automatisch vor', () => {
    mockListe([endkunde({ id: 'ek-1' }), endkunde({ id: 'ek-2' })]);

    const { result } = renderHook(() => useStandortUebersichtView());

    expect(result.current.nurEinEndkunde).toBe(false);
    expect(result.current.ausgewaehlteEndkundeId).toBeUndefined();
  });

  it('übernimmt eine manuelle Auswahl (`waehleEndkunde`) bei mehreren Endkunden', () => {
    mockListe([endkunde({ id: 'ek-1' }), endkunde({ id: 'ek-2' })]);

    const { result } = renderHook(() => useStandortUebersichtView());

    act(() => {
      result.current.waehleEndkunde('ek-2');
    });

    expect(result.current.ausgewaehlteEndkundeId).toBe('ek-2');
  });

  it('setzt die Auswahl über `wechsleEndkunde` wieder zurück auf die Auswahlliste', () => {
    mockListe([endkunde({ id: 'ek-1' }), endkunde({ id: 'ek-2' })]);

    const { result } = renderHook(() => useStandortUebersichtView());

    act(() => {
      result.current.waehleEndkunde('ek-2');
    });
    expect(result.current.ausgewaehlteEndkundeId).toBe('ek-2');

    act(() => {
      result.current.wechsleEndkunde();
    });

    expect(result.current.ausgewaehlteEndkundeId).toBeUndefined();
  });

  it('wählt NICHT automatisch vor, solange noch weitere Seiten nachgeladen werden könnten (`hasNextPage`)', () => {
    mockListe([endkunde()], { hasNextPage: true });

    const { result } = renderHook(() => useStandortUebersichtView());

    expect(result.current.nurEinEndkunde).toBe(false);
    expect(result.current.ausgewaehlteEndkundeId).toBeUndefined();
  });

  it('reicht Lade- und Fehlerzustand der zugrunde liegenden Endkunden-Liste unverändert durch', () => {
    mockListe([], { isPending: true });
    const { result: pendingResult } = renderHook(() => useStandortUebersichtView());
    expect(pendingResult.current.isPending).toBe(true);

    mockListe([], { isError: true });
    const { result: errorResult } = renderHook(() => useStandortUebersichtView());
    expect(errorResult.current.isError).toBe(true);
  });
});
