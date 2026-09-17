import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLueckenKachelView } from './useLueckenKachelView';

const { useVollstaendigkeitListeViewMock } = vi.hoisted(() => ({ useVollstaendigkeitListeViewMock: vi.fn() }));

vi.mock('../../stammdaten/hooks/monitoring', () => ({ useVollstaendigkeitListeView: useVollstaendigkeitListeViewMock }));

describe('useLueckenKachelView', () => {
  afterEach(() => {
    useVollstaendigkeitListeViewMock.mockReset();
  });

  it('zeigt `hatLuecken=false` bei leerer Liste', () => {
    useVollstaendigkeitListeViewMock.mockReturnValue({ items: [], isPending: false, isError: false, hasNextPage: false });

    const { result } = renderHook(() => useLueckenKachelView());

    expect(result.current.anzahlEndkunden).toBe(0);
    expect(result.current.hatLuecken).toBe(false);
  });

  it('dedupliziert auf Endkunde-Ebene und markiert `hatLuecken=true`', () => {
    useVollstaendigkeitListeViewMock.mockReturnValue({
      items: [
        { endkundeId: 'ek-1', systemId: null, zaehlerId: null, ebene: 'endkunde', luecken: ['kein_messkonzept'], geprueftAm: '2026-07-18T00:00:00.000Z' },
        { endkundeId: 'ek-2', systemId: null, zaehlerId: null, ebene: 'endkunde', luecken: ['kein_zaehler'], geprueftAm: '2026-07-18T00:00:00.000Z' },
      ],
      isPending: false,
      isError: false,
      hasNextPage: false,
    });

    const { result } = renderHook(() => useLueckenKachelView());

    expect(result.current.anzahlEndkunden).toBe(2);
    expect(result.current.hatLuecken).toBe(true);
  });
});
