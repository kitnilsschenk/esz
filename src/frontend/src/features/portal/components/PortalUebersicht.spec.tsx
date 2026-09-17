import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { PortalUebersicht } from './PortalUebersicht';

const { verlaufMock } = vi.hoisted(() => ({ verlaufMock: vi.fn() }));

vi.mock('../hooks/usePortalVerlaufView', () => ({ usePortalVerlaufView: verlaufMock }));
// Das Opt-out-Panel hat eigene Tests; hier stuende sonst nur sein Datenzugriff im Weg.
vi.mock('./PortalWiderspruchPanel', () => ({ PortalWiderspruchPanel: () => <div /> }));

function mockView(overrides: Record<string, unknown> = {}): void {
  verlaufMock.mockReturnValue({
    isPending: false,
    isError: false,
    ladeFehlerMeldung: 'Ladefehler',
    istLeer: false,
    zeilen: [
      {
        id: '018f1e2d-0000-7000-8000-0000000000e3',
        monatLabel: 'August 2026',
        energietraegerLabel: 'Strom',
        ergebnisLabel: '230,5 kWh eingespart',
        istMehrverbrauch: false,
        verbrauchLabel: '1.200,0 kWh',
      },
      {
        id: '018f1e2d-0000-7000-8000-0000000000e4',
        monatLabel: 'Juli 2026',
        energietraegerLabel: 'Wärme',
        ergebnisLabel: '180,0 kWh mehr verbraucht als erwartet',
        istMehrverbrauch: true,
        verbrauchLabel: '1.510,0 kWh',
      },
    ],
    ...overrides,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

function rendere(): HTMLElement {
  const { container } = render(
    <MemoryRouter>
      <PortalUebersicht />
    </MemoryRouter>,
  );
  return container;
}

describe('PortalUebersicht', () => {
  it('listet die Monate mit Ergebnis und Verbrauch', () => {
    mockView();

    rendere();

    expect(screen.getByRole('rowheader', { name: 'August 2026' })).toBeInTheDocument();
    expect(screen.getByText('230,5 kWh eingespart')).toBeInTheDocument();
    expect(screen.getByText('1.200,0 kWh')).toBeInTheDocument();
  });

  it('hebt einen Mehrverbrauch hervor, statt ihn wie eine Einsparung aussehen zu lassen', () => {
    mockView();

    rendere();

    const zelle = screen.getByText('180,0 kWh mehr verbraucht als erwartet');
    expect(zelle.className).toContain('text-destructive-text');
  });

  it('nennt den Energietraeger — sonst stehen zwei Zeilen desselben Monats ununterscheidbar da', () => {
    // Aufgefallen am echten Bestand: Ein Endkunde mit Strom UND Waerme sah
    // „September 2023" zweimal mit verschiedenen Zahlen und konnte die
    // Zeilen nicht auseinanderhalten.
    mockView();

    rendere();

    expect(screen.getByText('Strom')).toBeInTheDocument();
    expect(screen.getByText('Wärme')).toBeInTheDocument();
  });

  it('macht jeden Link fuer sich verstaendlich (WCAG 2.4.4)', () => {
    // Zwanzig gleichlautende „Ansehen"-Links sagen nichts darueber, wohin sie fuehren.
    mockView();

    rendere();

    expect(screen.getByRole('link', { name: 'Ansehen — August 2026, Strom' })).toHaveAttribute(
      'href',
      '/portal/monate/018f1e2d-0000-7000-8000-0000000000e3',
    );
  });

  it('sagt bei leerem Verlauf, dass noch nichts vorliegt', () => {
    mockView({ zeilen: [], istLeer: true });

    rendere();

    expect(screen.getByText(/noch keine monatliche Information vor/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('meldet einen Ladefehler', () => {
    mockView({ zeilen: [], isError: true });

    rendere();

    expect(screen.getByRole('alert')).toHaveTextContent('Ladefehler');
  });

  it('ist barrierefrei', async () => {
    mockView();

    expect(await runAxe(rendere())).toEqual([]);
  });
});
