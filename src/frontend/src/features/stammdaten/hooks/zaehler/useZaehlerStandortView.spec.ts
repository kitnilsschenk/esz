import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useZaehlerStandortView } from './useZaehlerStandortView';

const {
  useZaehlerDetailMock,
  useSystemDetailMock,
  useZaehlerAktuelleVerortungMock,
  useStandortLabelsMock,
  useZaehlerVerortungAnlegenMock,
  useKannStandortPiiLesenMock,
} = vi.hoisted(() => ({
  useZaehlerDetailMock: vi.fn(),
  useSystemDetailMock: vi.fn(),
  useZaehlerAktuelleVerortungMock: vi.fn(),
  useStandortLabelsMock: vi.fn(),
  useZaehlerVerortungAnlegenMock: vi.fn(),
  useKannStandortPiiLesenMock: vi.fn(),
}));

vi.mock('../../api/zaehler', () => ({ useZaehlerDetail: useZaehlerDetailMock }));
vi.mock('../../api/system', () => ({ useSystemDetail: useSystemDetailMock }));
vi.mock('../../api/standort', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/standort')>();
  return {
    ...actual,
    useZaehlerAktuelleVerortung: useZaehlerAktuelleVerortungMock,
    useStandortLabels: useStandortLabelsMock,
    useZaehlerVerortungAnlegen: useZaehlerVerortungAnlegenMock,
  };
});
vi.mock('../standort/useKannStandortPiiLesen', () => ({ useKannStandortPiiLesen: useKannStandortPiiLesenMock }));

const ZAEHLER_ID = '0198c3aa-aaaa-7000-8000-000000000001';
const SYSTEM_ID = '0198c3aa-bbbb-7000-8000-000000000002';
const ENDKUNDE_ID = '0198c3aa-cccc-7000-8000-000000000003';
const WURZEL_ID = '0198c3aa-dddd-7000-8000-000000000004';
const RAUM_ID = '0198c3aa-eeee-7000-8000-000000000005';

function mockGrundlagen(): void {
  useZaehlerDetailMock.mockReturnValue({ data: { id: ZAEHLER_ID, systemId: SYSTEM_ID }, isPending: false, isError: false });
  useSystemDetailMock.mockReturnValue({ data: { id: SYSTEM_ID, endkundeId: ENDKUNDE_ID }, isPending: false, isError: false });
  useZaehlerVerortungAnlegenMock.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
}

describe('useZaehlerStandortView', () => {
  afterEach(() => {
    useZaehlerDetailMock.mockReset();
    useSystemDetailMock.mockReset();
    useZaehlerAktuelleVerortungMock.mockReset();
    useStandortLabelsMock.mockReset();
    useZaehlerVerortungAnlegenMock.mockReset();
    useKannStandortPiiLesenMock.mockReset();
  });

  it('liefert `verortet=false` und eine leere Breadcrumb, wenn der Zähler unverortet ist (kein Fehlerzustand)', () => {
    mockGrundlagen();
    useKannStandortPiiLesenMock.mockReturnValue(true);
    useZaehlerAktuelleVerortungMock.mockReturnValue({
      data: { zaehlerId: ZAEHLER_ID, verortet: false, standortId: null, verortetSeit: null, pfad: [] },
      isPending: false,
      isError: false,
    });
    useStandortLabelsMock.mockReturnValue({ data: [], isPending: false, isError: false });

    const { result } = renderHook(() => useZaehlerStandortView(ZAEHLER_ID));

    expect(result.current.isError).toBe(false);
    expect(result.current.verortet).toBe(false);
    expect(result.current.breadcrumb).toHaveLength(0);
  });

  it('zeigt Platzhalter STATT Bezeichnung, wenn KEINE `read:standort_pii`-Berechtigung vorliegt — kein Fehlerzustand', () => {
    mockGrundlagen();
    useKannStandortPiiLesenMock.mockReturnValue(false);
    useZaehlerAktuelleVerortungMock.mockReturnValue({
      data: {
        zaehlerId: ZAEHLER_ID,
        verortet: true,
        standortId: RAUM_ID,
        verortetSeit: '2026-01-01T00:00:00.000Z',
        pfad: [
          { id: WURZEL_ID, parentId: null, typ: 'liegenschaft', ebene: 0, status: 'aktiv' },
          { id: RAUM_ID, parentId: WURZEL_ID, typ: 'raum', ebene: 1, status: 'aktiv' },
        ],
      },
      isPending: false,
      isError: false,
    });
    useStandortLabelsMock.mockReturnValue({ data: undefined, isPending: false, isError: false });

    const { result } = renderHook(() => useZaehlerStandortView(ZAEHLER_ID));

    expect(result.current.isError).toBe(false);
    expect(result.current.breadcrumb).toHaveLength(2);
    for (const eintrag of result.current.breadcrumb) {
      expect(eintrag.istPlatzhalter).toBe(true);
    }
    // PROAKTIV deaktiviert — kein Label-Aufruf ohne die Berechtigung.
    expect(useStandortLabelsMock).toHaveBeenCalledWith(ENDKUNDE_ID, [WURZEL_ID, RAUM_ID], { enabled: false });
  });

  it('holt die Breadcrumb-Labels als EIN Batch-Aufruf für ALLE Pfad-Knoten (nicht einen je Knoten)', () => {
    mockGrundlagen();
    useKannStandortPiiLesenMock.mockReturnValue(true);
    useZaehlerAktuelleVerortungMock.mockReturnValue({
      data: {
        zaehlerId: ZAEHLER_ID,
        verortet: true,
        standortId: RAUM_ID,
        verortetSeit: '2026-01-01T00:00:00.000Z',
        pfad: [
          { id: WURZEL_ID, parentId: null, typ: 'liegenschaft', ebene: 0, status: 'aktiv' },
          { id: RAUM_ID, parentId: WURZEL_ID, typ: 'raum', ebene: 1, status: 'aktiv' },
        ],
      },
      isPending: false,
      isError: false,
    });
    useStandortLabelsMock.mockReturnValue({
      data: [{ id: WURZEL_ID, bezeichnung: 'Campus Nord', anschrift: null }, { id: RAUM_ID, bezeichnung: 'Wohnung 3', anschrift: null }],
      isPending: false,
      isError: false,
    });

    const { result } = renderHook(() => useZaehlerStandortView(ZAEHLER_ID));

    expect(useStandortLabelsMock).toHaveBeenCalledTimes(1);
    expect(useStandortLabelsMock).toHaveBeenCalledWith(ENDKUNDE_ID, [WURZEL_ID, RAUM_ID], { enabled: true });
    expect(result.current.breadcrumb.map((eintrag) => eintrag.anzeigeName)).toEqual(['Campus Nord', 'Wohnung 3']);
    expect(result.current.breadcrumb.every((eintrag) => !eintrag.istPlatzhalter)).toBe(true);
  });
});
