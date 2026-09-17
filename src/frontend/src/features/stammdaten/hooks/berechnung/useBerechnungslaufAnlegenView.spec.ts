import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBerechnungslaufAnlegenView } from './useBerechnungslaufAnlegenView';

const { versionenMock, detailMock, vorschlagMock, anlegenMock, navigateMock } = vi.hoisted(() => ({
  versionenMock: vi.fn(),
  detailMock: vi.fn(),
  vorschlagMock: vi.fn(),
  anlegenMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('../../api/messkonzept', () => ({
  useMesskonzeptVersionenListe: versionenMock,
  useMesskonzeptVersionDetail: detailMock,
  encodeMesskonzeptVersionId: (ref: { endkundeId: string; versionNr: number }) =>
    `${ref.endkundeId}:${String(ref.versionNr)}`,
}));
vi.mock('../../api/berechnung', () => ({
  useParametervorschlag: vorschlagMock,
  useBerechnungslaufAnlegen: anlegenMock,
}));

const ENDKUNDE_ID = '018f1e2d-0000-7000-8000-00000000000e';
const MVET_ID = '018f1e2d-0000-7000-8000-0000000000a1';

const VORSCHLAG = {
  endkundeId: ENDKUNDE_ID,
  mvetId: MVET_ID,
  energietraeger: 'waerme',
  baselineWertKwh: 20_900,
  baselineEinheit: 'kWh',
  baselineEinheitVerwertbar: true,
  systemgrenzeQuelle: 'mvet_system',
  zaehlerAnzahl: 2,
  baselinePeriodenAnzahl: 1,
  gtzBaseErmittelbar: true,
  grundlast: {
    anteilVorschlag: 0.126,
    sommerMittelKwhTag: 7.213,
    jahresMittelKwhTag: 57.211,
    sommerTage: 62,
    basisTage: 365,
    basisVon: '2018-10-13',
    basisBis: '2019-10-12',
    basisHerkunft: 'baseline_periode',
    witterungsgefuehrt: true,
  },
  stationRefVorschlaege: ['DWD-04911'],
  datenVon: '2018-10-12',
  datenBis: '2023-10-11',
  periodeVonVorschlag: '2018-11-01',
  periodeBisVorschlag: '2023-10-01',
};

function mutate(): ReturnType<typeof vi.fn> {
  return vi.fn();
}

function mocks(
  vorschlag: Record<string, unknown> | undefined,
  mutation = mutate(),
  messkonzeptTyp = 'vereinfacht',
): void {
  versionenMock.mockReturnValue({
    data: { pages: [{ daten: [{ versionNr: 2, gueltigBis: null }, { versionNr: 1, gueltigBis: '2025-01-01' }] }] },
    isPending: false,
    isError: false,
  });
  detailMock.mockReturnValue({
    data: { typ: messkonzeptTyp, energietraeger: [{ mvetId: MVET_ID, energietraeger: 'waerme' }] },
    isPending: false,
    isError: false,
  });
  vorschlagMock.mockReturnValue({ data: vorschlag, isFetching: false });
  anlegenMock.mockReturnValue({ mutate: mutation, isPending: false, isSuccess: false, error: null });
}

/** Waehlt den Energietraeger — erst danach gibt es ueberhaupt einen Vorschlag. */
function mitAuswahl(vorschlag: Record<string, unknown> | undefined, mutation = mutate()) {
  mocks(vorschlag, mutation);
  const ergebnis = renderHook(() => useBerechnungslaufAnlegenView(ENDKUNDE_ID));
  act(() => {
    ergebnis.result.current.setzeWert('mvetId', MVET_ID);
  });
  return ergebnis;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useBerechnungslaufAnlegenView', () => {
  it('bietet die Energietraeger der AKTUELLEN Messkonzept-Version an', () => {
    // `gueltigBis === null` ist die aktuelle Version. Eine abgeloeste
    // anzubieten hiesse, gegen eine Baseline zu rechnen, die nicht mehr gilt.
    mocks(undefined);

    const { result } = renderHook(() => useBerechnungslaufAnlegenView(ENDKUNDE_ID));

    expect(result.current.energietraeger).toEqual([{ mvetId: MVET_ID, energietraeger: 'waerme' }]);
  });

  it('fragt gar nicht erst ab, wenn es keine gueltige Messkonzept-Version gibt', () => {
    // REGRESSION (2026-09-17). Ohne gueltige Version wurde hier bisher eine
    // Anfrage mit LEERER Kennung abgesetzt. Sie scheiterte serverseitig, und
    // die Oberflaeche meldete „Das Messkonzept konnte nicht geladen werden."
    // — was nach einer Stoerung klingt. Tatsaechlich war schlicht keines
    // hinterlegt, wofuer es eine eigene, hilfreiche Meldung gibt. Der
    // Bediener las einen Serverfehler, wo er eine Handlungsanweisung
    // gebraucht haette. Gefunden von einem Browser-Test, nicht von hier.
    mocks(undefined);
    versionenMock.mockReturnValue({
      // Jede Version abgeloest -> keine aktuelle.
      data: { pages: [{ daten: [{ versionNr: 1, gueltigBis: '2025-01-01' }] }] },
      isPending: false,
      isError: false,
    });
    // So sieht eine ABGESCHALTETE Query in TanStack Query aus: dauerhaft
    // `isPending`, ohne je zu laufen.
    detailMock.mockReturnValue({ data: undefined, isPending: true, isError: false });

    const { result } = renderHook(() => useBerechnungslaufAnlegenView(ENDKUNDE_ID));

    expect(detailMock).toHaveBeenCalledWith(expect.anything(), { enabled: false });
    // Und die Ansicht haengt NICHT im Ladezustand fest — das waere derselbe
    // Fehler noch einmal, nur mit einem Ladebalken statt einer falschen
    // Fehlermeldung.
    expect(result.current.isPending).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.energietraeger).toEqual([]);
  });

  it('uebernimmt den Vorschlag, sobald er da ist', () => {
    const { result } = mitAuswahl(VORSCHLAG);

    expect(result.current.werte.grundlastAnteil).toBe('0.126');
    expect(result.current.werte.periodeVon).toBe('2018-11-01');
    expect(result.current.werte.periodeBis).toBe('2023-10-01');
    expect(result.current.werte.stationRef).toBe('DWD-04911');
  });

  it('ueberschreibt eine Handeingabe NICHT bei jeder Neubewertung', () => {
    // Sonst spraenge der Wert dem Bediener unter den Fingern weg.
    const { result, rerender } = mitAuswahl(VORSCHLAG);
    act(() => {
      result.current.setzeWert('grundlastAnteil', '0.4');
    });

    rerender();

    expect(result.current.werte.grundlastAnteil).toBe('0.4');
  });

  it('holt den Vorschlag auf Wunsch zurueck', () => {
    const { result } = mitAuswahl(VORSCHLAG);
    act(() => {
      result.current.setzeWert('grundlastAnteil', '0.4');
    });

    act(() => {
      result.current.uebernimmVorschlag();
    });

    expect(result.current.werte.grundlastAnteil).toBe('0.126');
  });

  it('meldet die fehlende Baseline-Periode und sperrt das Absenden', () => {
    const { result } = mitAuswahl({ ...VORSCHLAG, gtzBaseErmittelbar: false });

    expect(result.current.hindernisse).toContain('gtz_base_fehlt');
    expect(result.current.absendbar).toBe(false);
  });

  it('meldet sie NICHT bei Grundlastanteil 1 — dann haengt nichts an GTZ_base', () => {
    const { result } = mitAuswahl({
      ...VORSCHLAG,
      gtzBaseErmittelbar: false,
      grundlast: { ...VORSCHLAG.grundlast, anteilVorschlag: 1 },
    });

    expect(result.current.werte.grundlastAnteil).toBe('1');
    expect(result.current.hindernisse).not.toContain('gtz_base_fehlt');
    expect(result.current.absendbar).toBe(true);
  });

  it('warnt vor dem endkunde_fallback, sperrt aber NICHT', () => {
    const { result } = mitAuswahl({ ...VORSCHLAG, systemgrenzeQuelle: 'endkunde_fallback' });

    expect(result.current.hindernisse).toContain('systemgrenze_fallback');
    expect(result.current.absendbar).toBe(true);
  });

  it('sperrt bei fehlender Baseline, fremder Einheit, ohne Zaehler und ohne Daten', () => {
    const { result } = mitAuswahl({
      ...VORSCHLAG,
      baselineWertKwh: null,
      baselineEinheitVerwertbar: false,
      zaehlerAnzahl: 0,
      datenVon: null,
    });

    expect(result.current.hindernisse).toEqual(
      expect.arrayContaining(['keine_baseline', 'einheit_nicht_verwertbar', 'keine_zaehler', 'keine_daten']),
    );
    expect(result.current.absendbar).toBe(false);
  });

  it('sperrt einen Grundlastanteil ausserhalb von 0 bis 1', () => {
    const { result } = mitAuswahl(VORSCHLAG);
    act(() => {
      result.current.setzeWert('grundlastAnteil', '1.5');
    });

    expect(result.current.absendbar).toBe(false);
  });

  it('nimmt ein Komma als Dezimaltrennzeichen an', () => {
    const mutation = mutate();
    const { result } = mitAuswahl(VORSCHLAG, mutation);
    act(() => {
      result.current.setzeWert('grundlastAnteil', '0,3');
    });

    act(() => {
      result.current.absenden();
    });

    expect((mutation.mock.calls[0]?.[0] as { grundlastAnteil: number }).grundlastAnteil).toBe(0.3);
  });

  it('sendet den Lauf als MANUELL ausgeloest', () => {
    // `job` bliebe der Automatik vorbehalten, die es noch nicht gibt.
    const mutation = mutate();
    const { result } = mitAuswahl(VORSCHLAG, mutation);

    act(() => {
      result.current.absenden();
    });

    expect(mutation.mock.calls[0]?.[0]).toEqual({
      endkundeId: ENDKUNDE_ID,
      mvetId: MVET_ID,
      periodeVon: '2018-11-01',
      periodeBis: '2023-10-01',
      grundlastAnteil: 0.126,
      stationRef: 'DWD-04911',
      ausloeser: 'manuell',
    });
  });

  describe('Messkonzept mit angepasster Baseline (V0076)', () => {
    function mitTyp(typ: string, vorschlag: Record<string, unknown> = VORSCHLAG) {
      mocks(vorschlag, mutate(), typ);
      const gerendert = renderHook(() => useBerechnungslaufAnlegenView(ENDKUNDE_ID));
      act(() => {
        gerendert.result.current.setzeWert('mvetId', MVET_ID);
      });
      gerendert.rerender();
      return gerendert;
    }

    it('sagt vorab, dass der eingegebene Grundlastanteil nicht eingeht', () => {
      // Sonst traegt jemand eine Zahl ein, sucht sie spaeter im Ergebnis und
      // findet sie nicht.
      const { result } = mitTyp('standard');

      expect(result.current.hindernisse).toContain('grundlast_wird_angepasst');
      // Ein Hinweis, kein Hindernis — der Lauf ist moeglich.
      expect(result.current.absendbar).toBe(true);
    });

    it('haelt fehlende Baseline-Perioden auch bei Grundlastanteil 1 fuer blockierend', () => {
      // Beim vereinfachten Weg haengt bei g = 1 nichts an GTZ_base. Hier
      // SIND die Baseline-Perioden die Vermessung selbst — ohne sie bricht
      // der Lauf ab, gleich was im g-Feld steht.
      const { result } = mitTyp('standard', { ...VORSCHLAG, gtzBaseErmittelbar: false });
      act(() => {
        result.current.setzeWert('grundlastAnteil', '1');
      });

      expect(result.current.hindernisse).toContain('gtz_base_fehlt');
      expect(result.current.absendbar).toBe(false);
    });

    it('warnt, wenn die Station nur aus früheren Läufen kommt', () => {
      // Frühere Läufe wiederholen zuverlässig auch eine falsche Station —
      // genau so blieb bei Pilotbestand A eine Station 220 km neben dem Objekt
      // jahrelang unbemerkt.
      const { result } = mitTyp('vereinfacht', { ...VORSCHLAG, stationRefHerkunft: 'fruehere_laeufe' });

      expect(result.current.hindernisse).toContain('station_nur_aus_laeufen');
      // Hinweis, kein Hindernis.
      expect(result.current.absendbar).toBe(true);
    });

    it('schweigt, wenn die Station am Standort hinterlegt ist', () => {
      const { result } = mitTyp('vereinfacht', { ...VORSCHLAG, stationRefHerkunft: 'standort' });

      expect(result.current.hindernisse).not.toContain('station_nur_aus_laeufen');
    });

    it('meldet nichts davon beim vereinfachten Messkonzept', () => {
      const { result } = mitTyp('vereinfacht');

      expect(result.current.hindernisse).not.toContain('grundlast_wird_angepasst');
    });
  });

  it('fuehrt nach Erfolg direkt zum Ergebnis', () => {
    // Sonst stuende man weiter vor dem Formular und wuesste nicht, ob etwas
    // passiert ist.
    const mutation = vi.fn((_eingabe: unknown, optionen?: { onSuccess?: (lauf: { id: string }) => void }) => {
      optionen?.onSuccess?.({ id: 'lauf-1' });
    });
    const { result } = mitAuswahl(VORSCHLAG, mutation);

    act(() => {
      result.current.absenden();
    });

    expect(navigateMock).toHaveBeenCalledWith(`/stammdaten/endkunden/${ENDKUNDE_ID}/berechnungen/lauf-1`);
  });
});
