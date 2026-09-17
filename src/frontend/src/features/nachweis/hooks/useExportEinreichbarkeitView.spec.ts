import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useExportEinreichbarkeitView } from './useExportEinreichbarkeitView';

const { useEinsparlaufDetailMock } = vi.hoisted(() => ({ useEinsparlaufDetailMock: vi.fn() }));

vi.mock('../api', () => ({ useEinsparlaufDetail: useEinsparlaufDetailMock }));

const LAUF_ID = '0198c3cc-cccc-7000-8000-000000000003';

describe('useExportEinreichbarkeitView', () => {
  afterEach(() => {
    useEinsparlaufDetailMock.mockReset();
  });

  it('fragt gar nicht erst ab, solange der Export-Kopf noch nicht geladen ist', () => {
    useEinsparlaufDetailMock.mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useExportEinreichbarkeitView(undefined));

    expect(useEinsparlaufDetailMock).toHaveBeenCalledWith('', { enabled: false });
    expect(result.current.isPending).toBe(true);
    expect(result.current.sperrGrund).toBeUndefined();
  });

  it('gibt einen Förderjahr-Nachweis ohne synthetische Daten frei', () => {
    useEinsparlaufDetailMock.mockReturnValue({ data: { art: 'foerderjahr_nachweis', synthetic: false } });

    const { result } = renderHook(() => useExportEinreichbarkeitView(LAUF_ID));

    expect(result.current.istEinreichbar).toBe(true);
    expect(result.current.sperrGrund).toBeUndefined();
  });

  it('sperrt einen Zwischenstand und nennt den Grund', () => {
    useEinsparlaufDetailMock.mockReturnValue({ data: { art: 'zwischenstand', synthetic: false } });

    const { result } = renderHook(() => useExportEinreichbarkeitView(LAUF_ID));

    expect(result.current.istEinreichbar).toBe(false);
    expect(result.current.sperrGrund).toContain('Zwischenstand');
  });

  it('sperrt einen Lauf mit synthetischen Daten im Umfang', () => {
    useEinsparlaufDetailMock.mockReturnValue({ data: { art: 'foerderjahr_nachweis', synthetic: true } });

    const { result } = renderHook(() => useExportEinreichbarkeitView(LAUF_ID));

    expect(result.current.istEinreichbar).toBe(false);
    expect(result.current.sperrGrund).toContain('synthetische Daten');
  });
});
