import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StandortStruktur } from '@edms/shared';
import { useEndkundeVerbrauchView } from './useEndkundeVerbrauchView';

const { useStandortBaumMock, useStandortLabelsMock, useKannStandortPiiLesenMock } = vi.hoisted(() => ({
  useStandortBaumMock: vi.fn(),
  useStandortLabelsMock: vi.fn(),
  useKannStandortPiiLesenMock: vi.fn(),
}));

vi.mock('../../api/standort', () => ({
  useStandortBaum: useStandortBaumMock,
  useStandortLabels: useStandortLabelsMock,
}));
vi.mock('../standort/useKannStandortPiiLesen', () => ({ useKannStandortPiiLesen: useKannStandortPiiLesenMock }));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

function knoten(overrides: Partial<StandortStruktur>): StandortStruktur {
  return {
    id: '0198c3aa-0000-7000-8000-000000000001',
    endkundeId: ENDKUNDE_ID,
    parentId: null,
    typ: 'liegenschaft',
    pfad: ['0198c3aa-0000-7000-8000-000000000001'],
    ebene: 0,
    sortierung: 0,
    status: 'aktiv',
    klimareferenz: null,
    hatAdresse: true,
    zaehlerAnzahl: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('useEndkundeVerbrauchView', () => {
  afterEach(() => {
    useStandortBaumMock.mockReset();
    useStandortLabelsMock.mockReset();
    useKannStandortPiiLesenMock.mockReset();
  });

  it('liefert `hatMehrereWurzeln=false` bei GENAU EINEM Wurzelknoten', () => {
    useStandortBaumMock.mockReturnValue({ data: [knoten({ id: 'wurzel-1' })], isPending: false, isError: false });
    useKannStandortPiiLesenMock.mockReturnValue(true);
    useStandortLabelsMock.mockReturnValue({ data: [{ id: 'wurzel-1', bezeichnung: 'Campus Nord', anschrift: null }], isPending: false, isError: false });

    const { result } = renderHook(() => useEndkundeVerbrauchView(ENDKUNDE_ID));

    expect(result.current.hatMehrereWurzeln).toBe(false);
    expect(result.current.wurzeln).toHaveLength(1);
  });

  it('liefert `hatMehrereWurzeln=true` bei MEHREREN Liegenschaften (Kacheln statt Summe)', () => {
    useStandortBaumMock.mockReturnValue({
      data: [
        knoten({ id: 'wurzel-1', sortierung: 0 }),
        knoten({ id: 'wurzel-2', typ: 'gebaeude', pfad: ['wurzel-2'], sortierung: 1 }),
        // Kind-Knoten (parentId gesetzt) darf NICHT als weitere Wurzel zählen.
        knoten({ id: 'kind-1', parentId: 'wurzel-1', typ: 'raum', pfad: ['wurzel-1', 'kind-1'], ebene: 1 }),
      ],
      isPending: false,
      isError: false,
    });
    useKannStandortPiiLesenMock.mockReturnValue(true);
    useStandortLabelsMock.mockReturnValue({
      data: [
        { id: 'wurzel-1', bezeichnung: 'Campus Nord', anschrift: null },
        { id: 'wurzel-2', bezeichnung: 'Campus Süd', anschrift: null },
      ],
      isPending: false,
      isError: false,
    });

    const { result } = renderHook(() => useEndkundeVerbrauchView(ENDKUNDE_ID));

    expect(result.current.hatMehrereWurzeln).toBe(true);
    expect(result.current.wurzeln.map((w) => w.standortId)).toEqual(['wurzel-1', 'wurzel-2']);
    // EIN Batch-Aufruf für BEIDE Wurzeln (nicht einer je Knoten).
    expect(useStandortLabelsMock).toHaveBeenCalledTimes(1);
    expect(useStandortLabelsMock).toHaveBeenCalledWith(ENDKUNDE_ID, ['wurzel-1', 'wurzel-2'], { enabled: true });
  });

  it('liefert `istLeer=true`, wenn der Endkunde noch keinen Standort hat', () => {
    useStandortBaumMock.mockReturnValue({ data: [], isPending: false, isError: false });
    useKannStandortPiiLesenMock.mockReturnValue(true);
    useStandortLabelsMock.mockReturnValue({ data: [], isPending: false, isError: false });

    const { result } = renderHook(() => useEndkundeVerbrauchView(ENDKUNDE_ID));

    expect(result.current.istLeer).toBe(true);
  });

  it('zeigt Platzhalter statt Bezeichnung, wenn KEINE `read:standort_pii`-Berechtigung vorliegt', () => {
    useStandortBaumMock.mockReturnValue({ data: [knoten({ id: 'wurzel-1' })], isPending: false, isError: false });
    useKannStandortPiiLesenMock.mockReturnValue(false);
    useStandortLabelsMock.mockReturnValue({ data: undefined, isPending: false, isError: false });

    const { result } = renderHook(() => useEndkundeVerbrauchView(ENDKUNDE_ID));

    expect(result.current.wurzeln[0]?.istPlatzhalter).toBe(true);
    expect(useStandortLabelsMock).toHaveBeenCalledWith(ENDKUNDE_ID, ['wurzel-1'], { enabled: false });
  });
});
