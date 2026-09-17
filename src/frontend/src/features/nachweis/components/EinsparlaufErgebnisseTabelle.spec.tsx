import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { EinsparlaufErgebnisseTabelle } from './EinsparlaufErgebnisseTabelle';

const { useEinsparlaufErgebnisseListeViewMock } = vi.hoisted(() => ({
  useEinsparlaufErgebnisseListeViewMock: vi.fn(),
}));

vi.mock('../hooks', () => ({ useEinsparlaufErgebnisseListeView: useEinsparlaufErgebnisseListeViewMock }));

const AUSGEWIESEN = {
  key: 'a:waerme',
  endkundeIdLabel: '0198c3aa',
  energietraegerLabel: 'Wärme',
  statusLabel: 'ausgewiesen',
  statusBadgeVariante: 'success' as const,
  einsparungLabel: '12.345 kWh',
  referenzLabel: '100.000 kWh',
  istLabel: '87.655 kWh',
  monateLabel: '12 / 0',
  qualitaetsStufeLabel: 'belastbar',
  qualitaetsStufeBadgeVariante: 'success' as const,
  ausschlussGrundLabel: 'keine Angabe',
  wissAuswertungAusgenommen: false,
};

const AUSGESCHLOSSEN = {
  ...AUSGEWIESEN,
  key: 'b:strom',
  endkundeIdLabel: '0298c3bb',
  energietraegerLabel: 'Strom',
  statusLabel: 'ausgeschlossen',
  statusBadgeVariante: 'outline' as const,
  einsparungLabel: 'keine Angabe',
  ausschlussGrundLabel: 'datenschutzrechtliche Einschränkung',
};

const BASIS = {
  items: [AUSGEWIESEN, AUSGESCHLOSSEN],
  isPending: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  loadMore: vi.fn(),
};

describe('EinsparlaufErgebnisseTabelle', () => {
  afterEach(() => {
    useEinsparlaufErgebnisseListeViewMock.mockReset();
  });

  it('zeigt ausgeschlossene Paare MIT und ohne Zahlenwert — ein Nachweis ohne sie wäre unvollständig', () => {
    useEinsparlaufErgebnisseListeViewMock.mockReturnValue(BASIS);

    render(
      <MemoryRouter>
        <EinsparlaufErgebnisseTabelle einsparlaufId="lauf" />
      </MemoryRouter>,
    );

    expect(screen.getByText('12.345 kWh')).toBeInTheDocument();
    expect(screen.getByText('ausgeschlossen')).toBeInTheDocument();
    expect(screen.getByText('datenschutzrechtliche Einschränkung')).toBeInTheDocument();
  });

  it('reichert den Ausschlussgrund nicht an', () => {
    // Der Server liefert bewusst einen neutralen Sammelcode; der genaue
    // Grund gehört nicht in eine Nachweis-Ansicht.
    useEinsparlaufErgebnisseListeViewMock.mockReturnValue(BASIS);

    render(
      <MemoryRouter>
        <EinsparlaufErgebnisseTabelle einsparlaufId="lauf" />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Art\. 18/)).not.toBeInTheDocument();
  });

  it('kennzeichnet Zeilen, die von der wissenschaftlichen Auswertung ausgenommen sind', () => {
    useEinsparlaufErgebnisseListeViewMock.mockReturnValue({
      ...BASIS,
      items: [{ ...AUSGEWIESEN, wissAuswertungAusgenommen: true }],
    });

    render(
      <MemoryRouter>
        <EinsparlaufErgebnisseTabelle einsparlaufId="lauf" />
      </MemoryRouter>,
    );

    expect(screen.getByText('ausgenommen')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useEinsparlaufErgebnisseListeViewMock.mockReturnValue(BASIS);

    const { container } = render(
      <MemoryRouter>
        <EinsparlaufErgebnisseTabelle einsparlaufId="lauf" />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
