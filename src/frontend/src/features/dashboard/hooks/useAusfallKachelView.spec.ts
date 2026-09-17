import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAusfallKachelView } from './useAusfallKachelView';

const { useAusfaelleListeViewMock } = vi.hoisted(() => ({ useAusfaelleListeViewMock: vi.fn() }));

vi.mock('../../stammdaten/hooks/monitoring', () => ({ useAusfaelleListeView: useAusfaelleListeViewMock }));

describe('useAusfallKachelView', () => {
  afterEach(() => {
    useAusfaelleListeViewMock.mockReset();
  });

  it('zeigt `hatAusfall=false` bei leerer Liste (keine ausgefallenen Zähler)', () => {
    useAusfaelleListeViewMock.mockReturnValue({ items: [], isPending: false, isError: false, hasNextPage: false });

    const { result } = renderHook(() => useAusfallKachelView());

    expect(result.current.anzahlZaehler).toBe(0);
    expect(result.current.hatAusfall).toBe(false);
  });

  it('dedupliziert auf Zähler-Ebene (mehrere Kanäle desselben Zählers zählen als EIN Zähler) und markiert `hatAusfall=true`', () => {
    useAusfaelleListeViewMock.mockReturnValue({
      items: [
        { messkanalId: 'mk-1', zaehlerId: 'z-1', letzteUebertragung: '2026-07-18T00:00:00.000Z', ueberfaellig: true, ausfallStatus: null, ausfallSeit: null },
        { messkanalId: 'mk-2', zaehlerId: 'z-1', letzteUebertragung: '2026-07-18T00:00:00.000Z', ueberfaellig: true, ausfallStatus: null, ausfallSeit: null },
        { messkanalId: 'mk-3', zaehlerId: 'z-2', letzteUebertragung: '2026-07-17T00:00:00.000Z', ueberfaellig: true, ausfallStatus: 'offen', ausfallSeit: '2026-07-17T00:00:00.000Z' },
      ],
      isPending: false,
      isError: false,
      hasNextPage: false,
    });

    const { result } = renderHook(() => useAusfallKachelView());

    expect(result.current.anzahlZaehler).toBe(2);
    expect(result.current.hatAusfall).toBe(true);
    expect(result.current.hatWeitere).toBe(false);
  });

  it('gibt `hatWeitere=true` weiter, solange die Liste noch mehr Seiten hat (kein Total-Count)', () => {
    useAusfaelleListeViewMock.mockReturnValue({
      items: [{ messkanalId: 'mk-1', zaehlerId: 'z-1', letzteUebertragung: '2026-07-18T00:00:00.000Z', ueberfaellig: true, ausfallStatus: null, ausfallSeit: null }],
      isPending: false,
      isError: false,
      hasNextPage: true,
    });

    const { result } = renderHook(() => useAusfallKachelView());

    expect(result.current.hatWeitere).toBe(true);
  });
});
