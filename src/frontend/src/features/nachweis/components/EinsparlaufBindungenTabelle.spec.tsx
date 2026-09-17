import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { EinsparlaufBindungenTabelle } from './EinsparlaufBindungenTabelle';

const { useEinsparlaufBindungenListeViewMock } = vi.hoisted(() => ({
  useEinsparlaufBindungenListeViewMock: vi.fn(),
}));

vi.mock('../hooks', () => ({ useEinsparlaufBindungenListeView: useEinsparlaufBindungenListeViewMock }));

const ZEILE = {
  key: 'a:waerme:2027-03-01',
  endkundeIdLabel: '0198c3aa',
  energietraegerLabel: 'Wärme',
  monatLabel: 'März 2027',
  referenzLabel: '10.000 kWh',
  istLabel: '8.500 kWh',
  deltaLabel: '1.500 kWh',
  deltaAusgewiesenLabel: '1.500 kWh',
  qualitaetsStufeLabel: 'belastbar',
  qualitaetsStufeBadgeVariante: 'success' as const,
  behandlungLabel: 'gemessen',
  mehrdeutigAufgeloest: false,
  berechnungslaufIdLabel: '0398c3dd',
};

const BASIS = {
  items: [ZEILE],
  isPending: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  loadMore: vi.fn(),
};

describe('EinsparlaufBindungenTabelle', () => {
  afterEach(() => {
    useEinsparlaufBindungenListeViewMock.mockReset();
  });

  it('zeigt die eingefrorenen Monatswerte samt der herangezogenen Berechnung', () => {
    useEinsparlaufBindungenListeViewMock.mockReturnValue(BASIS);

    render(
      <MemoryRouter>
        <EinsparlaufBindungenTabelle einsparlaufId="lauf" />
      </MemoryRouter>,
    );

    expect(screen.getByText('März 2027')).toBeInTheDocument();
    expect(screen.getByText('0398c3dd')).toBeInTheDocument();
  });

  it('macht eine aufgelöste Mehrdeutigkeit sichtbar', () => {
    useEinsparlaufBindungenListeViewMock.mockReturnValue({
      ...BASIS,
      items: [{ ...ZEILE, mehrdeutigAufgeloest: true }],
    });

    render(
      <MemoryRouter>
        <EinsparlaufBindungenTabelle einsparlaufId="lauf" />
      </MemoryRouter>,
    );

    expect(screen.getByText('mehrdeutig, aufgelöst')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useEinsparlaufBindungenListeViewMock.mockReturnValue(BASIS);

    const { container } = render(
      <MemoryRouter>
        <EinsparlaufBindungenTabelle einsparlaufId="lauf" />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
