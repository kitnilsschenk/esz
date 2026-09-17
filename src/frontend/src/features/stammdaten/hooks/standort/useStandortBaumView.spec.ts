import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StandortStruktur } from '@edms/shared';
import { useStandortBaumView } from './useStandortBaumView';

const { useStandortBaumMock, useStandortLabelsMock, useKannStandortPiiLesenMock } = vi.hoisted(() => ({
  useStandortBaumMock: vi.fn(),
  useStandortLabelsMock: vi.fn(),
  useKannStandortPiiLesenMock: vi.fn(),
}));

vi.mock('../../api/standort', () => ({
  useStandortBaum: useStandortBaumMock,
  useStandortLabels: useStandortLabelsMock,
}));
vi.mock('./useKannStandortPiiLesen', () => ({ useKannStandortPiiLesen: useKannStandortPiiLesenMock }));

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

const WURZEL_1 = knoten({ id: 'std-wurzel-1', sortierung: 0 });
const WURZEL_2 = knoten({ id: 'std-wurzel-2', typ: 'gebaeude', pfad: ['std-wurzel-2'], sortierung: 1 });

function mockBaum(daten: readonly StandortStruktur[]): void {
  useStandortBaumMock.mockReturnValue({ data: daten, isPending: false, isError: false, refetch: vi.fn() });
}

describe('useStandortBaumView', () => {
  afterEach(() => {
    useStandortBaumMock.mockReset();
    useStandortLabelsMock.mockReset();
    useKannStandortPiiLesenMock.mockReset();
  });

  it('zeigt Platzhalter-Anzeigetexte statt Bezeichnung, wenn KEINE `read:standort_pii`-Berechtigung vorliegt — kein Fehlerzustand', () => {
    mockBaum([WURZEL_1, WURZEL_2]);
    useKannStandortPiiLesenMock.mockReturnValue(false);
    useStandortLabelsMock.mockReturnValue({ data: undefined, isPending: false, isError: false });

    const { result } = renderHook(() => useStandortBaumView(ENDKUNDE_ID));

    expect(result.current.isError).toBe(false);
    expect(result.current.knoten).toHaveLength(2);
    for (const eintrag of result.current.knoten) {
      expect(eintrag.istPlatzhalter).toBe(true);
      expect(eintrag.anzeigeName).toMatch(/ohne Leseberechtigung/);
    }

    // PROAKTIV deaktiviert (kein 403-Abfangen nötig) — der Aufruf wird gar
    // nicht erst abgesetzt, solange die Rolle `read:standort_pii` fehlt.
    expect(useStandortLabelsMock).toHaveBeenCalledWith(ENDKUNDE_ID, expect.any(Array), { enabled: false });
  });

  it('setzt den Label-Batch-Aufruf für ALLE sichtbaren Knoten in EINEM Aufruf ab (nicht einen je Knoten)', () => {
    mockBaum([WURZEL_1, WURZEL_2]);
    useKannStandortPiiLesenMock.mockReturnValue(true);
    useStandortLabelsMock.mockReturnValue({ data: [], isPending: false, isError: false });

    renderHook(() => useStandortBaumView(ENDKUNDE_ID));

    // GENAU EIN Aufruf des Label-Hooks — mit BEIDEN sichtbaren Ids ALS EIN
    // Array-Argument (Batch), nicht zwei separate Aufrufe mit je einer Id.
    expect(useStandortLabelsMock).toHaveBeenCalledTimes(1);
    expect(useStandortLabelsMock).toHaveBeenCalledWith(ENDKUNDE_ID, [WURZEL_1.id, WURZEL_2.id], { enabled: true });
  });

  it('zeigt Bezeichnung im Klartext, sobald das Label-Batch erfolgreich geladen ist', () => {
    mockBaum([WURZEL_1]);
    useKannStandortPiiLesenMock.mockReturnValue(true);
    useStandortLabelsMock.mockReturnValue({
      data: [{ id: WURZEL_1.id, bezeichnung: 'Hauptgebäude Musterstraße', anschrift: 'Musterstraße 1' }],
      isPending: false,
      isError: false,
    });

    const { result } = renderHook(() => useStandortBaumView(ENDKUNDE_ID));

    expect(result.current.knoten[0]?.istPlatzhalter).toBe(false);
    expect(result.current.knoten[0]?.anzeigeName).toBe('Hauptgebäude Musterstraße');
  });

  it('degradiert bei einem Label-Batch-Fehler (z. B. unerwarteter 403) auf Platzhalter STATT eine Fehlermeldung zu zeigen', () => {
    mockBaum([WURZEL_1]);
    useKannStandortPiiLesenMock.mockReturnValue(true);
    useStandortLabelsMock.mockReturnValue({ data: undefined, isPending: false, isError: true });

    const { result } = renderHook(() => useStandortBaumView(ENDKUNDE_ID));

    expect(result.current.isError).toBe(false);
    expect(result.current.knoten[0]?.istPlatzhalter).toBe(true);
  });

  it('zeigt initial NUR Wurzelknoten; `toggleExpand` macht Kinder sichtbar', () => {
    const kind = knoten({ id: 'std-kind-1', parentId: WURZEL_1.id, typ: 'raum', pfad: [WURZEL_1.id, 'std-kind-1'], ebene: 1 });
    mockBaum([WURZEL_1, kind]);
    useKannStandortPiiLesenMock.mockReturnValue(true);
    useStandortLabelsMock.mockReturnValue({ data: [], isPending: false, isError: false });

    const { result } = renderHook(() => useStandortBaumView(ENDKUNDE_ID));

    expect(result.current.knoten.map((eintrag) => eintrag.id)).toEqual([WURZEL_1.id]);
    expect(result.current.knoten[0]?.hatKinder).toBe(true);
    expect(result.current.knoten[0]?.istExpandiert).toBe(false);

    act(() => {
      result.current.toggleExpand(WURZEL_1.id);
    });

    expect(result.current.knoten.map((eintrag) => eintrag.id)).toEqual([WURZEL_1.id, 'std-kind-1']);
  });

  it('liefert `istLeer === true`, wenn der Endkunde noch keinen Standort hat', () => {
    mockBaum([]);
    useKannStandortPiiLesenMock.mockReturnValue(true);
    useStandortLabelsMock.mockReturnValue({ data: [], isPending: false, isError: false });

    const { result } = renderHook(() => useStandortBaumView(ENDKUNDE_ID));

    expect(result.current.istLeer).toBe(true);
  });

  it('wählt beim Öffnen automatisch den ERSTEN sichtbaren (Wurzel-)Knoten als aktiven Knoten vor — kein leeres Panel', () => {
    mockBaum([WURZEL_2, WURZEL_1]); // absichtlich UNSORTIERT übergeben — die Sortierung nach `sortierung` entscheidet, nicht die Array-Reihenfolge
    useKannStandortPiiLesenMock.mockReturnValue(true);
    useStandortLabelsMock.mockReturnValue({ data: [], isPending: false, isError: false });

    const { result } = renderHook(() => useStandortBaumView(ENDKUNDE_ID));

    expect(result.current.aktiveId).toBe(WURZEL_1.id);
  });

  it('behält eine EXPLIZITE Auswahl (`setAktiveId`) bei, statt zur Auto-Vorauswahl zurückzufallen', () => {
    mockBaum([WURZEL_1, WURZEL_2]);
    useKannStandortPiiLesenMock.mockReturnValue(true);
    useStandortLabelsMock.mockReturnValue({ data: [], isPending: false, isError: false });

    const { result } = renderHook(() => useStandortBaumView(ENDKUNDE_ID));

    act(() => {
      result.current.setAktiveId(WURZEL_2.id);
    });

    expect(result.current.aktiveId).toBe(WURZEL_2.id);
  });
});
