import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { BaselinePeriodenAbschnitt } from './BaselinePeriodenAbschnitt';

const { periodenMock, setzenMock } = vi.hoisted(() => ({ periodenMock: vi.fn(), setzenMock: vi.fn() }));

vi.mock('../../api/messkonzept', () => ({
  useBaselinePerioden: periodenMock,
  useBaselinePeriodenSetzen: setzenMock,
}));

const MVET_ID = '018f1e2d-0000-7000-8000-0000000000a1';
const PERIODE_ID = '018f1e2d-0000-7000-8000-0000000000c1';

function mutation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { mutate: vi.fn(), isPending: false, isError: false, isSuccess: false, ...overrides };
}

afterEach(() => {
  vi.clearAllMocks();
});

function rendere(daten: Record<string, unknown>, setzen = mutation()): HTMLElement {
  periodenMock.mockReturnValue({ isPending: false, isError: false, ...daten });
  setzenMock.mockReturnValue(setzen);
  const { container } = render(
    <>
      <h1>Messkonzept</h1>
      <h2>Energieträger</h2>
      <BaselinePeriodenAbschnitt mvetId={MVET_ID} energietraegerLabel="Wärme" headingId="baseline-heading" />
    </>,
  );
  return container;
}

const LEER = {
  data: {
    mvetId: MVET_ID,
    energietraeger: 'waerme',
    perioden: [],
    baselineWert: null,
    baselineEinheit: null,
    abrechnungenAnzahlDeklariert: null,
    anzahlWeichtAb: false,
    gtzBaseErmittelbar: false,
    mengeMittel: null,
  },
};

const EINE_PERIODE = {
  data: {
    ...LEER.data,
    perioden: [
      {
        id: PERIODE_ID,
        von: '2023-01-01',
        bis: '2024-01-01',
        tage: 365,
        letzterTag: '2023-12-31',
        laengeAuffaellig: false,
        menge: 120_000,
        einheit: 'kWh',
      },
    ],
    gtzBaseErmittelbar: true,
  },
};

describe('BaselinePeriodenAbschnitt', () => {
  it('warnt, solange kein Bezugszeitraum erfasst ist', () => {
    // Ohne Periode bleibt fuer GTZ_base nur eine von Hand gesetzte
    // Gradtagzahl — das ist kein neutraler Anfangszustand.
    rendere(LEER);

    expect(screen.getByRole('alert')).toHaveTextContent('kein Bezugszeitraum erfasst');
    expect(screen.getByRole('alert')).toHaveTextContent('von Hand');
  });

  it('zeigt den LETZTEN enthaltenen Tag, nicht das ausschliessliche Ende', () => {
    // `bis` ist ausschliesslich (2024-01-01). Wer das mit dem letzten Tag
    // verwechselt, verliert ein Jahr und merkt es erst an der Einsparzahl.
    rendere(EINE_PERIODE);

    expect(screen.getByText(/01\.01\.2023 – 31\.12\.2023/)).toBeInTheDocument();
    expect(screen.queryByText(/01\.01\.2024/)).not.toBeInTheDocument();
  });

  it('nennt die Zahl der Tage', () => {
    rendere(EINE_PERIODE);

    expect(screen.getByText(/365 Tage/)).toBeInTheDocument();
  });

  it('markiert eine Periode, deren Laenge deutlich von einem Jahr abweicht', () => {
    // GTZ_base ist der ARITHMETISCHE Mittelwert der Gradtagzahl-Summen —
    // eine Halbjahres-Periode zieht ihn nach unten, ohne dass der Rechenweg
    // das ausgleicht.
    const periode = EINE_PERIODE.data.perioden[0];
    rendere({
      data: {
        ...EINE_PERIODE.data,
        perioden: [{ ...periode, bis: '2023-07-01', tage: 181, letzterTag: '2023-06-30', laengeAuffaellig: true }],
      },
    });

    expect(screen.getByText(/weicht deutlich von einem Jahr ab/)).toBeInTheDocument();
  });

  it('meldet, wenn die deklarierte Zahl der Abrechnungen nicht zu den Perioden passt', () => {
    rendere({ data: { ...EINE_PERIODE.data, abrechnungenAnzahlDeklariert: 3, anzahlWeichtAb: true } });

    const meldung = screen.getByRole('alert');
    expect(meldung).toHaveTextContent('Das Messkonzept nennt 3');
    expect(meldung).toHaveTextContent('erfasst sind 1');
  });

  it('stellt den Mittelwert der Mengen neben die Baseline', () => {
    // TB-02 verlangt genau diesen Mittelwert als Baseline. Die Ansicht
    // rechnet ihn NICHT selbst — sie zeigt, was der Server geliefert hat.
    rendere({
      data: { ...EINE_PERIODE.data, baselineWert: 118_000, baselineEinheit: 'kWh', mengeMittel: 120_000 },
    });

    expect(
      screen.getByText(/Mittelwert der erfassten Mengen: 120\.000 kWh · Baseline im Messkonzept: 118\.000 kWh/),
    ).toBeInTheDocument();
  });

  it('oeffnet die Bearbeitung mit dem AKTUELLEN Stand', () => {
    rendere(EINE_PERIODE);

    fireEvent.click(screen.getByRole('button', { name: 'Bezugszeiträume ändern' }));

    expect(screen.getByRole('textbox', { name: /Abgerechnete Menge/ })).toHaveValue('120000');
  });

  it('bietet bei leerem Bestand sofort eine Zeile an', () => {
    rendere(LEER);

    fireEvent.click(screen.getByRole('button', { name: 'Bezugszeiträume ändern' }));

    expect(screen.getByRole('textbox', { name: /Abgerechnete Menge/ })).toHaveValue('');
  });

  it('sendet die ganze Menge und laesst unvollstaendige Zeilen weg', () => {
    const setzen = mutation();
    rendere(LEER, setzen);

    fireEvent.click(screen.getByRole('button', { name: 'Bezugszeiträume ändern' }));
    fireEvent.change(screen.getByLabelText(/Beginn des Zeitraums 1/), { target: { value: '2023-01-01' } });
    fireEvent.change(screen.getByLabelText(/Ende des Zeitraums \(ausschließlich\) 1/), {
      target: { value: '2024-01-01' },
    });
    // Zweite Zeile bleibt leer — sie darf nicht mitgesendet werden.
    fireEvent.click(screen.getByRole('button', { name: 'Zeitraum hinzufügen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bezugszeiträume speichern' }));

    const argumente = (setzen['mutate'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as unknown[];
    expect(argumente).toEqual([{ von: '2023-01-01', bis: '2024-01-01' }]);
  });

  it('nimmt ein Komma als Dezimaltrennzeichen an', () => {
    const setzen = mutation();
    rendere(LEER, setzen);

    fireEvent.click(screen.getByRole('button', { name: 'Bezugszeiträume ändern' }));
    fireEvent.change(screen.getByLabelText(/Beginn des Zeitraums 1/), { target: { value: '2023-01-01' } });
    fireEvent.change(screen.getByLabelText(/Ende des Zeitraums \(ausschließlich\) 1/), {
      target: { value: '2024-01-01' },
    });
    fireEvent.change(screen.getByLabelText(/Abgerechnete Menge/), { target: { value: '1200,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bezugszeiträume speichern' }));

    const argumente = (setzen['mutate'] as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { menge: number }[];
    expect(argumente[0]?.menge).toBe(1200.5);
  });

  it('erklaert im Bearbeiten, dass „bis" ausschliesslich ist', () => {
    rendere(EINE_PERIODE);

    fireEvent.click(screen.getByRole('button', { name: 'Bezugszeiträume ändern' }));

    expect(screen.getByText(/erste Tag NACH dem Abrechnungszeitraum/)).toBeInTheDocument();
  });

  it('laesst sich abbrechen, ohne zu speichern', () => {
    const setzen = mutation();
    rendere(EINE_PERIODE, setzen);

    fireEvent.click(screen.getByRole('button', { name: 'Bezugszeiträume ändern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(setzen['mutate']).not.toHaveBeenCalled();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('zeigt die Fehlermeldung des Servers statt einer allgemeinen', () => {
    // Die Ueberschneidungs-Meldung sagt, WARUM es nicht geht — der
    // allgemeine Satz „konnte nicht gespeichert werden" verschluckt das.
    rendere(
      EINE_PERIODE,
      mutation({ isError: true, error: { detail: 'Die Zeitraeume … ueberschneiden sich.' } }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('ueberschneiden sich');
  });

  it('sagt, dass bereits gerechnete Laeufe unveraendert bleiben', () => {
    rendere(EINE_PERIODE);

    expect(screen.getByText(/Bereits gerechnete Läufe bleiben unverändert/)).toBeInTheDocument();
  });

  it('meldet einen Ladefehler', () => {
    rendere({ isError: true, data: undefined });

    expect(screen.getByRole('alert')).toHaveTextContent('konnten nicht geladen werden');
  });

  it('ist barrierefrei', async () => {
    expect(await runAxe(rendere(EINE_PERIODE))).toEqual([]);
  });

  it('ist auch im Bearbeitungszustand barrierefrei', async () => {
    const container = rendere(EINE_PERIODE);
    fireEvent.click(screen.getByRole('button', { name: 'Bezugszeiträume ändern' }));

    expect(await runAxe(container)).toEqual([]);
  });
});
