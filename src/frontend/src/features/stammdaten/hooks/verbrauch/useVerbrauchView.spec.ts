import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VerbrauchAggregatAntwort } from '@edms/shared';
import { useVerbrauchView } from './useVerbrauchView';

const { useVerbrauchMock } = vi.hoisted(() => ({ useVerbrauchMock: vi.fn() }));

vi.mock('../../api/verbrauch', () => ({ useVerbrauch: useVerbrauchMock }));

const STANDORT_ID = '0198c3aa-aaaa-7000-8000-000000000001';

function mockAntwort(antwort: VerbrauchAggregatAntwort, ueberschreibungen: Partial<{ isPending: boolean; isError: boolean; isSuccess: boolean }> = {}): void {
  useVerbrauchMock.mockReturnValue({
    data: antwort,
    isPending: false,
    isError: false,
    isSuccess: true,
    ...ueberschreibungen,
  });
}

describe('useVerbrauchView', () => {
  afterEach(() => {
    useVerbrauchMock.mockReset();
  });

  it('gruppiert die Zeitreihe nach Einheit und darunter nach Messgröße', () => {
    mockAntwort({
      zeitreihe: [
        { zeitpunkt: '2026-07-01T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: 10 },
        { zeitpunkt: '2026-07-02T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: 12 },
        { zeitpunkt: '2026-07-01T00:00:00.000Z', messgroesse: 'volumen', einheit: 'm3', wert: 3 },
      ],
      metadaten: { einbezogeneZaehler: 2, einbezogeneKanaele: 3, ausgelasseneUntermessungen: 0, erkannteLuecken: 1 },
    });

    const { result } = renderHook(() => useVerbrauchView(STANDORT_ID));
    // Standard-Zeitraum ist "letzte 30 Tage" bis heute — die Fixture-Werte
    // (Juli 2026) liegen ggf. außerhalb; die Gruppierung selbst hängt nur an
    // der vom Mock gelieferten `zeitreihe`, nicht am tatsächlichen Bucket-Fenster.
    act(() => {
      result.current.setVonDatum('2026-07-01');
      result.current.setBisDatum('2026-07-02');
    });

    expect(result.current.gruppen).toHaveLength(2);
    const kwhGruppe = result.current.gruppen.find((gruppe) => gruppe.einheit === 'kWh');
    const m3Gruppe = result.current.gruppen.find((gruppe) => gruppe.einheit === 'm3');
    expect(kwhGruppe?.serien).toHaveLength(1);
    expect(kwhGruppe?.serien[0]?.messgroesse).toBe('wirkarbeit');
    expect(m3Gruppe?.serien).toHaveLength(1);
  });

  it('richtet jede Serie auf die VOLLSTÄNDIGE Bucket-Folge aus — ein fehlender Bucket wird zu `undefined` (Lücke), NIE zu 0', () => {
    mockAntwort({
      zeitreihe: [{ zeitpunkt: '2026-07-01T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: 10 }],
      metadaten: { einbezogeneZaehler: 1, einbezogeneKanaele: 1, ausgelasseneUntermessungen: 0, erkannteLuecken: 2 },
    });

    const { result } = renderHook(() => useVerbrauchView(STANDORT_ID));
    act(() => {
      result.current.setAufloesung('tag');
      result.current.setVonDatum('2026-07-01');
      result.current.setBisDatum('2026-07-03');
    });

    expect(result.current.buckets).toEqual(['2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z', '2026-07-03T00:00:00.000Z']);
    const serie = result.current.gruppen[0]?.serien[0];
    expect(serie?.werte).toEqual([10, undefined, undefined]);
  });

  it('spiegelt in der Tabellenansicht EXAKT dieselben Werte wie das Diagramm (inkl. Lücken)', () => {
    mockAntwort({
      zeitreihe: [{ zeitpunkt: '2026-07-01T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: 10 }],
      metadaten: { einbezogeneZaehler: 1, einbezogeneKanaele: 1, ausgelasseneUntermessungen: 0, erkannteLuecken: 1 },
    });

    const { result } = renderHook(() => useVerbrauchView(STANDORT_ID));
    act(() => {
      result.current.setAufloesung('tag');
      result.current.setVonDatum('2026-07-01');
      result.current.setBisDatum('2026-07-02');
    });

    expect(result.current.tabelle).toEqual([
      { zeitpunkt: '2026-07-01T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: 10 },
      { zeitpunkt: '2026-07-02T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: undefined },
    ]);
  });

  it('erkennt einen ungültigen Zeitraum (`von` nicht vor `bis`) und setzt die Abfrage NICHT aktiv', () => {
    mockAntwort({ zeitreihe: [], metadaten: { einbezogeneZaehler: 0, einbezogeneKanaele: 0, ausgelasseneUntermessungen: 0, erkannteLuecken: 0 } });

    const { result } = renderHook(() => useVerbrauchView(STANDORT_ID));
    act(() => {
      result.current.setVonDatum('2026-08-01');
      result.current.setBisDatum('2026-07-01');
    });

    expect(result.current.zeitraumUngueltig).toBe(true);
    expect(useVerbrauchMock).toHaveBeenLastCalledWith(STANDORT_ID, expect.anything(), { enabled: false });
  });

  it('liefert `istLeer: true`, wenn die Abfrage erfolgreich war, aber KEINE Messwerte existieren', () => {
    mockAntwort({ zeitreihe: [], metadaten: { einbezogeneZaehler: 3, einbezogeneKanaele: 4, ausgelasseneUntermessungen: 0, erkannteLuecken: 30 } });

    const { result } = renderHook(() => useVerbrauchView(STANDORT_ID));

    expect(result.current.istLeer).toBe(true);
    expect(result.current.metadaten?.erkannteLuecken).toBe(30);
  });

  it('setzt beim Wechsel der Auflösung automatisch ein sinnvolles Standard-Zeitfenster', () => {
    mockAntwort({ zeitreihe: [], metadaten: { einbezogeneZaehler: 0, einbezogeneKanaele: 0, ausgelasseneUntermessungen: 0, erkannteLuecken: 0 } });

    const { result } = renderHook(() => useVerbrauchView(STANDORT_ID));
    const bisVorher = result.current.bisDatum;

    act(() => {
      result.current.setAufloesung('monat');
    });

    expect(result.current.aufloesung).toBe('monat');
    expect(result.current.bisDatum).toBe(bisVorher);
    expect(result.current.vonDatum < bisVorher).toBe(true);
  });
});
