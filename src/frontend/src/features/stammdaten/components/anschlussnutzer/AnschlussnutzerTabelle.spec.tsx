import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { AnschlussnutzerTabelle } from './AnschlussnutzerTabelle';

const { useAnschlussnutzerListeViewMock } = vi.hoisted(() => ({
  useAnschlussnutzerListeViewMock: vi.fn(),
}));

vi.mock('../../hooks/anschlussnutzer', () => ({ useAnschlussnutzerListeView: useAnschlussnutzerListeViewMock }));

describe('AnschlussnutzerTabelle', () => {
  afterEach(() => {
    useAnschlussnutzerListeViewMock.mockReset();
  });

  it('zeigt Endkunde-Referenz und Verarbeitungsstatus, aber KEINEN Namen (Linie 2)', () => {
    useAnschlussnutzerListeViewMock.mockReturnValue({
      items: [
        {
          id: '0198c3aa-aaaa-7000-8000-000000000001',
          endkundeId: '0198c3aa-bbbb-7000-8000-000000000002',
          verarbeitungsStatus: 'aktiv',
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
        <AnschlussnutzerTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('aktiv')).toBeInTheDocument();
    expect(screen.queryByText(/Mustermann/)).not.toBeInTheDocument();
  });

  it('zeigt die Leer-Meldung, wenn keine Anschlussnutzer vorhanden sind', () => {
    useAnschlussnutzerListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AnschlussnutzerTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('Noch kein Anschlussnutzer erfasst. Das ist der Normalfall, solange Vertragspartner und tatsächlicher Nutzer identisch sind.')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useAnschlussnutzerListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <AnschlussnutzerTabelle />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
