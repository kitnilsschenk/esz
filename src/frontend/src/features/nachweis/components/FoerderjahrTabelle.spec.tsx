import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { FoerderjahrTabelle } from './FoerderjahrTabelle';

const { useFoerderjahreListeViewMock } = vi.hoisted(() => ({ useFoerderjahreListeViewMock: vi.fn() }));

vi.mock('../hooks', () => ({ useFoerderjahreListeView: useFoerderjahreListeViewMock }));

const LEER = {
  items: [],
  isPending: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  loadMore: vi.fn(),
};

describe('FoerderjahrTabelle', () => {
  afterEach(() => {
    useFoerderjahreListeViewMock.mockReset();
  });

  it('zeigt Kennung, Projektjahr und Zeitraum und verlinkt auf das Förderjahr', () => {
    useFoerderjahreListeViewMock.mockReturnValue({
      ...LEER,
      items: [
        {
          id: '0198c3aa-aaaa-7000-8000-000000000001',
          code: 'FJ-2027',
          nummerLabel: '2',
          zeitraumLabel: 'Januar 2027 – Dezember 2027',
          definitionQuelleLabel: 'Kalenderjahr',
          vorhabenRef: 'AZ-4711',
          createdAtLabel: '26.08.2026, 16:32',
        },
      ],
    });

    render(
      <MemoryRouter>
        <FoerderjahrTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('FJ-2027')).toBeInTheDocument();
    expect(screen.getByText('Januar 2027 – Dezember 2027')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Details anzeigen FJ-2027' })).toHaveAttribute(
      'href',
      '/nachweis/foerderjahre/0198c3aa-aaaa-7000-8000-000000000001',
    );
  });

  it('sagt im Leerzustand, was als Nächstes zu tun ist', () => {
    useFoerderjahreListeViewMock.mockReturnValue(LEER);

    render(
      <MemoryRouter>
        <FoerderjahrTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Legen Sie zuerst das Förderjahr an/)).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useFoerderjahreListeViewMock.mockReturnValue(LEER);

    const { container } = render(
      <MemoryRouter>
        <FoerderjahrTabelle />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
