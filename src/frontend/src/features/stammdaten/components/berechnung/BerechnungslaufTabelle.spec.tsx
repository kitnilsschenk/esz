import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { BerechnungslaufTabelle } from './BerechnungslaufTabelle';

const { useBerechnungslaufListeViewMock } = vi.hoisted(() => ({ useBerechnungslaufListeViewMock: vi.fn() }));

vi.mock('../../hooks/berechnung', () => ({ useBerechnungslaufListeView: useBerechnungslaufListeViewMock }));

const EINE_ZEILE = {
  id: '0198c3aa-aaaa-7000-8000-000000000001',
  periodeLabel: 'Januar 2026 – März 2026',
  energietraegerLabel: 'Strom',
  qualitaetsStufeLabel: 'belastbar',
  qualitaetsStufeBadgeVariante: 'success' as const,
  erstelltAt: '2026-04-01T00:00:00.000Z',
};

function renderMitRouter(): void {
  render(
    <MemoryRouter>
      <BerechnungslaufTabelle endkundeId="endkunde-1" />
    </MemoryRouter>,
  );
}

describe('BerechnungslaufTabelle', () => {
  afterEach(() => {
    useBerechnungslaufListeViewMock.mockReset();
  });

  it('zeigt Periode, Energieträger, Qualitäts-Badge und Erstellungszeitpunkt je Lauf', () => {
    useBerechnungslaufListeViewMock.mockReturnValue({
      items: [EINE_ZEILE],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    renderMitRouter();

    expect(screen.getByText('Januar 2026 – März 2026')).toBeInTheDocument();
    expect(screen.getByText('Strom')).toBeInTheDocument();
    expect(screen.getByText('belastbar')).toBeInTheDocument();
    expect(screen.getByText('2026-04-01T00:00:00.000Z')).toBeInTheDocument();
  });

  it('verlinkt jede Zeile zum Lauf-Detail des jeweiligen Endkunden', () => {
    useBerechnungslaufListeViewMock.mockReturnValue({
      items: [EINE_ZEILE],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    renderMitRouter();

    const link = screen.getByRole('link', { name: /Details anzeigen/ });
    expect(link).toHaveAttribute('href', '/stammdaten/endkunden/endkunde-1/berechnungen/0198c3aa-aaaa-7000-8000-000000000001');
  });

  it('zeigt die Leer-Meldung, wenn für den Endkunden noch keine Läufe vorliegen', () => {
    useBerechnungslaufListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    renderMitRouter();

    expect(screen.getByText('Für diesen Endkunden liegen noch keine Berechnungsläufe vor.')).toBeInTheDocument();
  });

  it('zeigt eine Fehlermeldung bei `isError`', () => {
    useBerechnungslaufListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: true,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    renderMitRouter();

    expect(screen.getByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useBerechnungslaufListeViewMock.mockReturnValue({
      items: [EINE_ZEILE],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <BerechnungslaufTabelle endkundeId="endkunde-1" />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
