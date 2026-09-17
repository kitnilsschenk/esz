import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { NutzungsverhaeltnisseTabelle } from './NutzungsverhaeltnisseTabelle';

const { useNutzungsverhaeltnisseListeViewMock } = vi.hoisted(() => ({
  useNutzungsverhaeltnisseListeViewMock: vi.fn(),
}));

vi.mock('../../hooks/nutzungsverhaeltnis', () => ({
  useNutzungsverhaeltnisseListeView: useNutzungsverhaeltnisseListeViewMock,
}));

describe('NutzungsverhaeltnisseTabelle', () => {
  afterEach(() => {
    useNutzungsverhaeltnisseListeViewMock.mockReset();
  });

  it('zeigt Datenklasse und Rolle als deutschen Text sowie „aktuell" für ein offenes Verhältnis', () => {
    useNutzungsverhaeltnisseListeViewMock.mockReturnValue({
      items: [
        {
          id: '0198c3aa-aaaa-7000-8000-000000000001',
          endkundeId: '0298c3bb-bbbb-7000-8000-000000000002',
          anschlussnutzerId: '0398c3cc-cccc-7000-8000-000000000003',
          systemId: '0498c3dd-dddd-7000-8000-000000000004',
          datenklasse: 'abrechnungsminimum',
          rolle: 'mieter',
          gueltigVon: '2026-01-01T00:00:00.000Z',
          gueltigBis: null,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <NutzungsverhaeltnisseTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('Abrechnungsminimum')).toBeInTheDocument();
    expect(screen.getByText('Mieter')).toBeInTheDocument();
    expect(screen.getByText('aktuell (kein Enddatum)')).toBeInTheDocument();
  });

  it('zeigt die Leer-Meldung, wenn keine Nutzungsverhältnisse vorhanden sind', () => {
    useNutzungsverhaeltnisseListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <NutzungsverhaeltnisseTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('Noch kein Nutzungsverhältnis erfasst. Es verknüpft einen Anschlussnutzer zeitlich befristet mit einem Endkunden-Vertrag.')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useNutzungsverhaeltnisseListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <NutzungsverhaeltnisseTabelle />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
