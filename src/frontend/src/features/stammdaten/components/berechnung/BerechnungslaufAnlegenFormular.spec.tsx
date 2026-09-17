import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { BerechnungslaufAnlegenFormular } from './BerechnungslaufAnlegenFormular';

const { viewMock } = vi.hoisted(() => ({ viewMock: vi.fn() }));

vi.mock('../../hooks/berechnung/useBerechnungslaufAnlegenView', () => ({
  useBerechnungslaufAnlegenView: viewMock,
}));

const ENDKUNDE_ID = '018f1e2d-0000-7000-8000-00000000000e';
const MVET_STROM = '018f1e2d-0000-7000-8000-0000000000a1';

const HERLEITUNG = {
  anteilVorschlag: 0.126,
  sommerMittelKwhTag: 7.213,
  jahresMittelKwhTag: 57.211,
  sommerTage: 62,
  basisTage: 365,
  basisVon: '2018-10-13',
  basisBis: '2019-10-12',
  basisHerkunft: 'baseline_periode' as const,
  witterungsgefuehrt: true,
};

const VORSCHLAG = {
  endkundeId: ENDKUNDE_ID,
  mvetId: MVET_STROM,
  energietraeger: 'waerme',
  baselineWertKwh: 20_900,
  baselineEinheit: 'kWh',
  baselineEinheitVerwertbar: true,
  systemgrenzeQuelle: 'mvet_system' as const,
  zaehlerAnzahl: 2,
  baselinePeriodenAnzahl: 1,
  gtzBaseErmittelbar: true,
  grundlast: HERLEITUNG,
  stationRefVorschlaege: ['DWD-04911'],
  datenVon: '2018-10-12',
  datenBis: '2023-10-11',
  periodeVonVorschlag: '2018-11-01',
  periodeBisVorschlag: '2023-10-01',
};

const setzeWert = vi.fn();
const absenden = vi.fn();
const uebernimmVorschlag = vi.fn();

function mockView(overrides: Record<string, unknown> = {}): void {
  viewMock.mockReturnValue({
    energietraeger: [
      { mvetId: MVET_STROM, energietraeger: 'waerme' },
      { mvetId: '018f1e2d-0000-7000-8000-0000000000a2', energietraeger: 'strom' },
    ],
    isPending: false,
    isError: false,
    isSubmitting: false,
    submitErrorMessage: undefined,
    erfolgsMeldung: undefined,
    werte: {
      mvetId: MVET_STROM,
      periodeVon: '2018-11-01',
      periodeBis: '2023-10-01',
      grundlastAnteil: '0.126',
      stationRef: 'DWD-04911',
    },
    setzeWert,
    vorschlag: VORSCHLAG,
    vorschlagLaedt: false,
    uebernimmVorschlag,
    hindernisse: [],
    absendbar: true,
    absenden,
    ...overrides,
  });
}

function rendere(): HTMLElement {
  const { container } = render(
    <>
      <h1>Berechnung starten</h1>
      <BerechnungslaufAnlegenFormular endkundeId={ENDKUNDE_ID} />
    </>,
  );
  return container;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('BerechnungslaufAnlegenFormular', () => {
  it('laesst den Energietraeger waehlen — ein Lauf je Traeger', () => {
    mockView();
    rendere();

    const auswahl = screen.getByLabelText('Energieträger');
    expect(auswahl).toHaveValue(MVET_STROM);
    fireEvent.change(auswahl, { target: { value: '018f1e2d-0000-7000-8000-0000000000a2' } });

    expect(setzeWert).toHaveBeenCalledWith('mvetId', '018f1e2d-0000-7000-8000-0000000000a2');
  });

  it('zeigt die HERLEITUNG des Grundlastanteils, nicht nur die Zahl', () => {
    // Der Grundlastanteil ist die einzige Zahl dieses Formulars, die man
    // nicht nachschlagen kann. Ein geratenes 0,25 hat in diesem Projekt
    // jeden Sommermonat als Mehrverbrauch ausgewiesen.
    mockView();
    rendere();

    expect(screen.getByText(/Sommermittel 7,2 kWh\/Tag/)).toBeInTheDocument();
    expect(screen.getByText(/Jahresmittel 57,2 kWh\/Tag/)).toBeInTheDocument();
    expect(screen.getByText(/0,126/)).toBeInTheDocument();
  });

  it('benennt, WORAUS die Herleitung stammt', () => {
    mockView();
    rendere();

    expect(screen.getByText(/aus den erfassten Baseline-Bezugszeiträumen/)).toBeInTheDocument();
  });

  it('warnt, wenn die Herleitung nur auf dem ersten Datenjahr beruht', () => {
    mockView({
      vorschlag: { ...VORSCHLAG, grundlast: { ...HERLEITUNG, basisHerkunft: 'erste_messdaten' } },
    });
    rendere();

    expect(screen.getByText(/muss nicht das Baselinejahr sein/)).toBeInTheDocument();
  });

  it('erklaert den Fall „nicht witterungsgefuehrt"', () => {
    // Pilotbestand A, Strom: Juli/August liegen UEBER dem Jahresmittel. Der
    // Vorschlag ist dann 1 — und das braucht eine Begruendung, sonst sieht
    // es nach einem Fehler aus.
    mockView({
      vorschlag: {
        ...VORSCHLAG,
        grundlast: { ...HERLEITUNG, anteilVorschlag: 1, witterungsgefuehrt: false },
      },
    });
    rendere();

    expect(screen.getByText(/folgt der Heizwitterung nicht/)).toBeInTheDocument();
  });

  it('bietet an, den Vorschlag zurueckzuholen, wenn von Hand abgewichen wurde', () => {
    mockView({
      werte: {
        mvetId: MVET_STROM,
        periodeVon: '2018-11-01',
        periodeBis: '2023-10-01',
        grundlastAnteil: '0.25',
        stationRef: 'DWD-04911',
      },
    });
    rendere();

    expect(screen.getByText(/weicht vom Vorschlag ab/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vorschlag übernehmen' }));

    expect(uebernimmVorschlag).toHaveBeenCalled();
  });

  it('bietet das NICHT an, solange der Vorschlag unveraendert ist', () => {
    mockView();
    rendere();

    expect(screen.queryByText(/weicht vom Vorschlag ab/)).not.toBeInTheDocument();
  });

  it('sagt, dass „bis" ausschliesslich ist und nennt die Datenspanne', () => {
    mockView();
    rendere();

    expect(screen.getByLabelText('Zeitraum bis (ausschließlich)')).toBeInTheDocument();
    expect(screen.getByText(/12\.10\.2018 – 11\.10\.2023/)).toBeInTheDocument();
  });

  it('schlaegt bereits verwendete Klimastationen vor, ohne das Feld zu schliessen', () => {
    mockView();
    rendere();

    const feld = screen.getByLabelText('Klimastation');
    expect(feld).toHaveValue('DWD-04911');
    // Ein `datalist` schlaegt vor und laesst Eigenes zu — anders als ein
    // `select`, das eine noch nie verwendete Station unmoeglich machte.
    expect(feld).toHaveAttribute('list');
  });

  it('nennt die fehlende Baseline-Periode als Hindernis samt Ausweg', () => {
    mockView({ hindernisse: ['gtz_base_fehlt'], absendbar: false });
    rendere();

    const meldung = screen.getByRole('alert');
    expect(meldung).toHaveTextContent('kein Baseline-Bezugszeitraum erfasst');
    expect(meldung).toHaveTextContent('Grundlastanteil auf 1');
    expect(screen.getByRole('button', { name: 'Berechnung starten' })).toBeDisabled();
  });

  it('warnt vor dem endkunde_fallback, blockiert aber NICHT', () => {
    // Es gibt Bestaende mit genau einem Messkonzept, fuer die der Fallback
    // richtig rechnet. Eine Warnung ist keine Unmoeglichkeit.
    mockView({ hindernisse: ['systemgrenze_fallback'], absendbar: true });
    rendere();

    expect(screen.getByRole('alert')).toHaveTextContent('fremder Verbrauch');
    expect(screen.getByRole('button', { name: 'Berechnung starten' })).toBeEnabled();
  });

  it('sagt vor dem Rechnen, dass es dauern kann', () => {
    // Die Route rechnet synchron. Ohne den Hinweis sieht ein mehrjaehriger
    // Lauf wie ein haengendes Formular aus.
    mockView();
    rendere();

    expect(screen.getByText(/rechnet sofort und kann bei einem mehrjährigen Zeitraum/)).toBeInTheDocument();
  });

  it('startet den Lauf', () => {
    mockView();
    rendere();

    fireEvent.click(screen.getByRole('button', { name: 'Berechnung starten' }));

    expect(absenden).toHaveBeenCalled();
  });

  it('zeigt den Serverfehler im Wortlaut', () => {
    mockView({ submitErrorMessage: 'periodeVon muss ein Monatsanfang sein.' });
    rendere();

    expect(screen.getByRole('alert')).toHaveTextContent('Monatsanfang');
  });

  it('sagt es, wenn gar kein Messkonzept vorliegt', () => {
    mockView({ energietraeger: [], vorschlag: undefined });
    rendere();

    expect(screen.getByRole('alert')).toHaveTextContent('keine gültige Messkonzept-Version');
  });

  it('ist barrierefrei', async () => {
    mockView();

    expect(await runAxe(rendere())).toEqual([]);
  });
});
