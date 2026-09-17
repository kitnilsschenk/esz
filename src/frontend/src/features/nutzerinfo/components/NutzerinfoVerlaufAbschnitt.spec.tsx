import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { NutzerinfoVerlaufAbschnitt } from './NutzerinfoVerlaufAbschnitt';

const { verlaufViewMock } = vi.hoisted(() => ({ verlaufViewMock: vi.fn() }));

vi.mock('./NutzerinfoBericht', () => ({ NutzerinfoBericht: () => null }));
vi.mock('../hooks/useNutzerinfoVerlaufView', () => ({ useNutzerinfoVerlaufView: verlaufViewMock }));

const EINSPARUNG = {
  id: '018f1e2d-0000-7000-8000-0000000000a1',
  monatLabel: '01.08.2026',
  energietraeger: 'strom',
  ergebnisLabel: '230,5 kWh eingespart',
  istMehrverbrauch: false,
  verbrauchLabel: '1.200,0 kWh',
  erwartungLabel: '1.430,5 kWh',
  guteLabel: 'Belastbar',
  zugestelltLabel: undefined,
  zustellwegLabel: undefined,
  istZugestellt: false,
};

const MEHRVERBRAUCH = {
  ...EINSPARUNG,
  id: '018f1e2d-0000-7000-8000-0000000000a2',
  monatLabel: '01.07.2026',
  ergebnisLabel: '180,0 kWh mehr verbraucht als erwartet',
  istMehrverbrauch: true,
  zugestelltLabel: '02.08.2026, 12:00',
  zustellwegLabel: 'Per Brief',
  istZugestellt: true,
};

const setzeAngaben = vi.fn();
const vermerke = vi.fn();

function mockView(overrides: Record<string, unknown> = {}): void {
  verlaufViewMock.mockReturnValue({
    monate: [EINSPARUNG, MEHRVERBRAUCH],
    isPending: false,
    isError: false,
    ladeFehlerMeldung: 'Ladefehler',
    leerMeldung: 'Noch nichts erzeugt.',
    anzahlOffen: 1,
    offenHinweis: '1 Monate sind erzeugt, aber noch nicht zugestellt.',
    angaben: { zugestelltAm: '2026-09-02', zustellweg: 'brief' as const },
    setzeAngaben,
    vermerke,
    isSubmitting: false,
    submitErrorMessage: undefined,
    erfolgsMeldung: undefined,
    ...overrides,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('NutzerinfoVerlaufAbschnitt (TB-06)', () => {
  it('benennt einen Mehrverbrauch als solchen statt ihn zu glätten', () => {
    mockView();
    render(<NutzerinfoVerlaufAbschnitt endkundeId="e1" headingId="h" />);

    // Das Merkblatt verlangt „Einsparungen und/oder Mehrverbräuche" — die
    // Ansicht darf die Richtung nicht verschweigen.
    expect(screen.getByText('180,0 kWh mehr verbraucht als erwartet')).toBeInTheDocument();
    expect(screen.getByText('230,5 kWh eingespart')).toBeInTheDocument();
  });

  it('weist offene Monate aus — erzeugen ist nicht informieren', () => {
    mockView();
    render(<NutzerinfoVerlaufAbschnitt endkundeId="e1" headingId="h" />);

    expect(screen.getByText('1 Monate sind erzeugt, aber noch nicht zugestellt.')).toBeInTheDocument();
    expect(screen.getByText('Noch nicht zugestellt')).toBeInTheDocument();
  });

  it('zeigt Einzelheiten erst auf Anforderung', () => {
    mockView();
    render(<NutzerinfoVerlaufAbschnitt endkundeId="e1" headingId="h" />);

    expect(screen.queryByText('Erwartet nach Ausgangsbasis')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Einzelheiten' })[0]!);

    expect(screen.getByText('Erwartet nach Ausgangsbasis')).toBeInTheDocument();
    expect(screen.getByText('1.430,5 kWh')).toBeInTheDocument();
  });

  it('vermerkt eine Zustellung mit der Kennung des Monats', () => {
    mockView();
    render(<NutzerinfoVerlaufAbschnitt endkundeId="e1" headingId="h" />);

    fireEvent.click(screen.getByRole('button', { name: 'Als zugestellt vermerken' }));

    expect(vermerke).toHaveBeenCalledWith(EINSPARUNG.id);
  });

  it('sperrt das Vermerken ohne Datum — ein Nachweis ohne Tag ist keiner', () => {
    mockView({ angaben: { zugestelltAm: '', zustellweg: 'brief' as const } });
    render(<NutzerinfoVerlaufAbschnitt endkundeId="e1" headingId="h" />);

    expect(screen.getByRole('button', { name: 'Als zugestellt vermerken' })).toBeDisabled();
  });

  it('sagt im Leerzustand, wo erzeugt wird', () => {
    mockView({ monate: [], anzahlOffen: 0, offenHinweis: undefined });
    render(<NutzerinfoVerlaufAbschnitt endkundeId="e1" headingId="h" />);

    expect(screen.getByText('Noch nichts erzeugt.')).toBeInTheDocument();
  });

  it('ist barrierefrei', async () => {
    mockView();
    const { container } = render(<NutzerinfoVerlaufAbschnitt endkundeId="e1" headingId="h" />);

    expect(await runAxe(container)).toEqual([]);
  });
});
