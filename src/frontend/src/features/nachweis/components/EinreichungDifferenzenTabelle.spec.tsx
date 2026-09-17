import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { EinreichungDifferenzenTabelle } from './EinreichungDifferenzenTabelle';

const { useEinreichungDifferenzenListeViewMock } = vi.hoisted(() => ({
  useEinreichungDifferenzenListeViewMock: vi.fn(),
}));

vi.mock('../hooks', () => ({ useEinreichungDifferenzenListeView: useEinreichungDifferenzenListeViewMock }));

const BASIS = {
  items: [
    {
      key: 'a:waerme',
      endkundeIdLabel: '0198c3aa',
      energietraegerLabel: 'Wärme',
      wertAltLabel: '10.000 kWh',
      wertNeuLabel: '9.500 kWh',
      deltaLabel: '-500 kWh',
      ursacheLabel: 'Messwert-Korrektur',
    },
  ],
  isPending: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  loadMore: vi.fn(),
};

describe('EinreichungDifferenzenTabelle', () => {
  afterEach(() => {
    useEinreichungDifferenzenListeViewMock.mockReset();
  });

  it('stellt alten und neuen Wert samt Ursache gegenüber', () => {
    useEinreichungDifferenzenListeViewMock.mockReturnValue(BASIS);

    render(
      <MemoryRouter>
        <EinreichungDifferenzenTabelle einreichungId="einreichung-1" />
      </MemoryRouter>,
    );

    expect(screen.getByText('10.000 kWh')).toBeInTheDocument();
    expect(screen.getByText('9.500 kWh')).toBeInTheDocument();
    expect(screen.getByText('Messwert-Korrektur')).toBeInTheDocument();
  });

  it('erklärt den Leerzustand, statt nur Abwesenheit festzustellen', () => {
    useEinreichungDifferenzenListeViewMock.mockReturnValue({ ...BASIS, items: [] });

    render(
      <MemoryRouter>
        <EinreichungDifferenzenTabelle einreichungId="einreichung-1" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/diese Einreichung löst keine frühere ab/)).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useEinreichungDifferenzenListeViewMock.mockReturnValue(BASIS);

    const { container } = render(
      <MemoryRouter>
        <EinreichungDifferenzenTabelle einreichungId="einreichung-1" />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
