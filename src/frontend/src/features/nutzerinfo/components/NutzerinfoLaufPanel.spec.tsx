import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { NutzerinfoLaufPanel } from './NutzerinfoLaufPanel';

const { laufViewMock } = vi.hoisted(() => ({ laufViewMock: vi.fn() }));

vi.mock('../hooks/useNutzerinfoLaufView', () => ({ useNutzerinfoLaufView: laufViewMock }));

const starteProbelauf = vi.fn();
const starteAusfuehrung = vi.fn();
const setzeMonat = vi.fn();

function zahlen(ohneBerechnung: number): readonly Record<string, unknown>[] {
  return [
    { schluessel: 'erzeugt', label: 'Informationen erzeugt', wert: 42, erlaeuterung: 'Liegt vor.', istBefund: false },
    {
      schluessel: 'widerspruch',
      label: 'Wegen Widerspruch ausgelassen',
      wert: 3,
      erlaeuterung: 'Das ist zulässig.',
      istBefund: false,
    },
    {
      schluessel: 'gesperrt',
      label: 'Wegen Einschränkung ausgelassen',
      wert: 1,
      erlaeuterung: 'Bewusst nicht informiert.',
      istBefund: false,
    },
    {
      schluessel: 'ohneBerechnung',
      label: 'Ohne Berechnungsgrundlage',
      wert: ohneBerechnung,
      erlaeuterung: 'Müssten informiert werden und können es nicht.',
      istBefund: ohneBerechnung > 0,
    },
  ];
}

function mockView(overrides: Record<string, unknown> = {}): void {
  laufViewMock.mockReturnValue({
    monat: '2026-08',
    setzeMonat,
    monatFehler: undefined,
    starteProbelauf,
    starteAusfuehrung,
    ergebnis: undefined,
    isSubmitting: false,
    submitErrorMessage: undefined,
    erfolgsMeldung: undefined,
    ...overrides,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('NutzerinfoLaufPanel (TB-06)', () => {
  it('bietet Zählen und Erzeugen getrennt an', () => {
    mockView();
    render(<NutzerinfoLaufPanel />);

    // Zwei Absichten, zwei Schaltflächen — die folgenreichere soll nicht die
    // sein, die man aus Versehen trifft.
    fireEvent.click(screen.getByRole('button', { name: 'Zählen (ohne zu erzeugen)' }));
    expect(starteProbelauf).toHaveBeenCalledTimes(1);
    expect(starteAusfuehrung).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Informationen erzeugen' }));
    expect(starteAusfuehrung).toHaveBeenCalledTimes(1);
  });

  it('hebt Endkunden ohne Berechnungsgrundlage als Befund hervor', () => {
    mockView({
      ergebnis: {
        monatLabel: '01.08.2026',
        modusLabel: 'Ausgeführt',
        warProbelauf: false,
        zahlen: zahlen(7),
        fazit: 'Für einen Teil der Endkunden fehlt die Berechnungsgrundlage.',
      },
    });
    render(<NutzerinfoLaufPanel />);

    expect(screen.getByText('Für einen Teil der Endkunden fehlt die Berechnungsgrundlage.')).toBeInTheDocument();
    expect(screen.getByText('Müssten informiert werden und können es nicht.')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('sagt nach einem Probelauf, dass nichts erzeugt wurde', () => {
    mockView({
      ergebnis: {
        monatLabel: '01.08.2026',
        modusLabel: 'Probelauf',
        warProbelauf: true,
        zahlen: zahlen(0),
        fazit: 'Jeder Endkunde mit einer Berechnung für diesen Monat ist abgedeckt.',
      },
    });
    render(<NutzerinfoLaufPanel />);

    expect(screen.getByText('Es wurde nichts erzeugt. Die Zahlen zeigen, was ein Lauf bewirken würde.')).toBeInTheDocument();
  });

  it('sperrt beide Aktionen bei ungültigem Monat und meldet den Fehler', () => {
    mockView({ monat: 'unsinn', monatFehler: 'Bitte einen Monat im Format JJJJ-MM wählen.' });
    render(<NutzerinfoLaufPanel />);

    expect(screen.getByRole('alert')).toHaveTextContent('Bitte einen Monat im Format JJJJ-MM wählen.');
    expect(screen.getByRole('button', { name: 'Zählen (ohne zu erzeugen)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Informationen erzeugen' })).toBeDisabled();
  });

  it('ist barrierefrei', async () => {
    mockView();
    const { container } = render(<NutzerinfoLaufPanel />);

    expect(await runAxe(container)).toEqual([]);
  });
});
