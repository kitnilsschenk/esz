import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMesskanalLastgangView } from './useMesskanalLastgangView';

const { useMesskanalZeitreiheLesenMock } = vi.hoisted(() => ({ useMesskanalZeitreiheLesenMock: vi.fn() }));

vi.mock('../../api/verbrauch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/verbrauch')>();
  return { ...actual, useMesskanalZeitreiheLesen: useMesskanalZeitreiheLesenMock };
});

const MESSKANAL_ID = '0198c3aa-aaaa-7000-8000-000000000001';
const ZAEHLER_ID = '0198c3aa-bbbb-7000-8000-000000000002';

describe('useMesskanalLastgangView', () => {
  afterEach(() => {
    useMesskanalZeitreiheLesenMock.mockReset();
  });

  it('hat VOR dem ersten Submit kein Ergebnis (kein Dauer-Diagramm-Zustand)', () => {
    useMesskanalZeitreiheLesenMock.mockReturnValue({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null, data: undefined });

    const { result } = renderHook(() => useMesskanalLastgangView(MESSKANAL_ID, ZAEHLER_ID));

    expect(result.current.hatErgebnis).toBe(false);
    expect(result.current.zeilen).toHaveLength(0);
  });

  it('mappt die Zeitraum-Formularwerte + den Zähler-Kontext beim Submit auf die Mutation', () => {
    const mutate = vi.fn();
    useMesskanalZeitreiheLesenMock.mockReturnValue({ mutate, isPending: false, isSuccess: false, error: null, data: undefined });

    const { result } = renderHook(() => useMesskanalLastgangView(MESSKANAL_ID, ZAEHLER_ID));
    result.current.submit({ von: '2026-07-20', bis: '2026-07-21' });

    expect(mutate).toHaveBeenCalledWith({
      messkanalId: MESSKANAL_ID,
      anfrage: {
        von: '2026-07-20T00:00:00.000Z',
        bis: '2026-07-22T00:00:00.000Z',
        zugriffszweck: {
          zweckCode: 'stoerungsdiagnose',
          zaehlerId: ZAEHLER_ID,
          von: '2026-07-20T00:00:00.000Z',
          bis: '2026-07-22T00:00:00.000Z',
        },
      },
    });
  });

  it('zeigt die Rohwerte nach erfolgreichem Submit', () => {
    useMesskanalZeitreiheLesenMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: true,
      error: null,
      data: {
        messkanalId: MESSKANAL_ID,
        messgroesse: 'wirkarbeit',
        einheit: 'kWh',
        art: 'kumulativ_zaehlerstand',
        werte: [{ ts: '2026-07-20T00:00:00.000Z', wert: 12, qualitaet: 'gemessen', herkunft: 'ingest_live' }],
      },
    });

    const { result } = renderHook(() => useMesskanalLastgangView(MESSKANAL_ID, ZAEHLER_ID));

    expect(result.current.hatErgebnis).toBe(true);
    expect(result.current.istLeer).toBe(false);
    expect(result.current.zeilen).toHaveLength(1);
  });
});
