import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { NutzerinfoVersandPanel } from './NutzerinfoVersandPanel';

const { versandViewMock, kannAnlegenMock } = vi.hoisted(() => ({
  versandViewMock: vi.fn(),
  kannAnlegenMock: vi.fn(),
}));

vi.mock('../hooks/useNutzerinfoVersandView', () => ({ useNutzerinfoVersandView: versandViewMock }));
vi.mock('../../stammdaten/hooks/shared/useKannStammdatenAnlegen', () => ({
  useKannStammdatenAnlegen: kannAnlegenMock,
}));

function view(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    monat: '2026-08',
    setzeMonat: vi.fn(),
    monatFehler: undefined,
    mappeLaeuft: false,
    mappeHolen: vi.fn(),
    dialogOffen: false,
    oeffneDialog: vi.fn(),
    schliesseDialog: vi.fn(),
    zustellenLaeuft: false,
    zustellen: vi.fn(),
    fehlerMeldung: undefined,
    erfolgsMeldung: undefined,
    ...overrides,
  };
}

describe('NutzerinfoVersandPanel (TB-06 — Versand und Zustellnachweis)', () => {
  afterEach(() => {
    versandViewMock.mockReset();
    kannAnlegenMock.mockReset();
  });

  it('trennt Mappe holen und Zustellung vermerken in zwei Schaltflächen', () => {
    // Beides in einen Klick zu legen hieße, den Versandnachweis auf den
    // Druckvorgang zu stützen — und der beweist nichts.
    versandViewMock.mockReturnValue(view());
    kannAnlegenMock.mockReturnValue(true);

    render(<NutzerinfoVersandPanel />);

    expect(screen.getByRole('button', { name: 'Versandmappe holen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zustellung für den Monat vermerken' })).toBeInTheDocument();
  });

  it('holt die Mappe auf Klick', () => {
    const mappeHolen = vi.fn();
    versandViewMock.mockReturnValue(view({ mappeHolen }));
    kannAnlegenMock.mockReturnValue(true);

    render(<NutzerinfoVersandPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Versandmappe holen' }));

    expect(mappeHolen).toHaveBeenCalledTimes(1);
  });

  it('vermerkt die Zustellung NICHT ohne Rückfrage — sie gilt für den ganzen Monat', () => {
    const zustellen = vi.fn();
    const oeffneDialog = vi.fn();
    versandViewMock.mockReturnValue(view({ zustellen, oeffneDialog }));
    kannAnlegenMock.mockReturnValue(true);

    render(<NutzerinfoVersandPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Zustellung für den Monat vermerken' }));

    expect(zustellen).not.toHaveBeenCalled();
    expect(oeffneDialog).toHaveBeenCalledTimes(1);
  });

  it('sagt im Dialog, dass bereits Zugestelltes unberührt bleibt', () => {
    versandViewMock.mockReturnValue(view({ dialogOffen: true }));
    kannAnlegenMock.mockReturnValue(true);

    render(<NutzerinfoVersandPanel />);

    expect(screen.getByText(/bleiben unverändert/)).toBeInTheDocument();
    expect(screen.getByText(/nicht zurücknehmen/)).toBeInTheDocument();
  });

  it('bietet Rollen ohne Schreibrecht nur die Mappe an, nicht den Vermerk', () => {
    // Lesen darf auch der Auditor — es ist sein Nachweis. Zustellen nicht.
    versandViewMock.mockReturnValue(view());
    kannAnlegenMock.mockReturnValue(false);

    render(<NutzerinfoVersandPanel />);

    expect(screen.getByRole('button', { name: 'Versandmappe holen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zustellung für den Monat vermerken' })).not.toBeInTheDocument();
  });

  it('zeigt einen Serverfehler im Klartext', () => {
    versandViewMock.mockReturnValue(
      view({ fehlerMeldung: 'Für 2026-08-01 ist keine Nutzerinformation erzeugt.' }),
    );
    kannAnlegenMock.mockReturnValue(true);

    render(<NutzerinfoVersandPanel />);

    expect(screen.getByText(/keine Nutzerinformation erzeugt/)).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    versandViewMock.mockReturnValue(view());
    kannAnlegenMock.mockReturnValue(true);

    const { container } = render(<NutzerinfoVersandPanel />);

    expect(await runAxe(container)).toEqual([]);
  });
});
