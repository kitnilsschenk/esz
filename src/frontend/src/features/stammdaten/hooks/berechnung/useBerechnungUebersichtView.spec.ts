import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EndkundeListItem } from '@edms/shared';
import { useBerechnungUebersichtView } from './useBerechnungUebersichtView';

const { useEndkundenListeViewMock } = vi.hoisted(() => ({ useEndkundenListeViewMock: vi.fn() }));

vi.mock('../endkunde', () => ({ useEndkundenListeView: useEndkundenListeViewMock }));

function endkunde(id: string): EndkundeListItem {
  return {
    id,
    verarbeitungsStatus: 'aktiv',
    consentStatus: 'fehlt',
    vonWissAuswertungAusgenommen: false,
    endkundengruppe: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function mockListe(items: readonly EndkundeListItem[], hasNextPage = false): void {
  useEndkundenListeViewMock.mockReturnValue({
    items,
    isPending: false,
    isError: false,
    hasNextPage,
    isFetchingNextPage: false,
    loadMore: vi.fn(),
  });
}

describe('useBerechnungUebersichtView', () => {
  afterEach(() => {
    useEndkundenListeViewMock.mockReset();
  });

  it('wählt GENAU EINEN vorhandenen Endkunden automatisch vor', () => {
    mockListe([endkunde('a')]);

    const { result } = renderHook(() => useBerechnungUebersichtView());

    expect(result.current.nurEinEndkunde).toBe(true);
    expect(result.current.ausgewaehlteEndkundeId).toBe('a');
  });

  it('wählt NICHT automatisch vor, solange eine weitere Seite folgen könnte', () => {
    // Sonst hinge die Auto-Auswahl daran, wie viele Einträge zufällig auf der
    // ersten Seite lagen.
    mockListe([endkunde('a')], true);

    const { result } = renderHook(() => useBerechnungUebersichtView());

    expect(result.current.nurEinEndkunde).toBe(false);
    expect(result.current.ausgewaehlteEndkundeId).toBeUndefined();
  });

  it('lässt die manuelle Auswahl vor der automatischen den Vorrang', () => {
    mockListe([endkunde('a'), endkunde('b')]);

    const { result } = renderHook(() => useBerechnungUebersichtView());
    act(() => {
      result.current.waehleEndkunde('b');
    });
    expect(result.current.ausgewaehlteEndkundeId).toBe('b');

    act(() => {
      result.current.wechsleEndkunde();
    });
    expect(result.current.ausgewaehlteEndkundeId).toBeUndefined();
  });
});
