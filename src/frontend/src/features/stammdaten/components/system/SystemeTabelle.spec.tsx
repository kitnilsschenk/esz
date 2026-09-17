import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { SystemeTabelle } from './SystemeTabelle';

const { useSystemeListeViewMock } = vi.hoisted(() => ({
  useSystemeListeViewMock: vi.fn(),
}));

vi.mock('../../hooks/system', () => ({ useSystemeListeView: useSystemeListeViewMock }));

describe('SystemeTabelle', () => {
  afterEach(() => {
    useSystemeListeViewMock.mockReset();
  });

  it('zeigt Bezeichnung, gekürzte IDs und Status der Systeme', () => {
    useSystemeListeViewMock.mockReturnValue({
      items: [
        {
          id: '0198c3aa-aaaa-7000-8000-000000000001',
          endkundeId: '0298c3bb-bbbb-7000-8000-000000000002',
          bezeichnung: 'Bürogebäude Hauptstraße',
          status: 'aktiv',
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
        <SystemeTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('Bürogebäude Hauptstraße')).toBeInTheDocument();
    expect(screen.getByText('0198c3aa')).toBeInTheDocument();
    expect(screen.getByText('0298c3bb')).toBeInTheDocument();
    expect(screen.getByText('aktiv')).toBeInTheDocument();
  });

  it('zeigt die Leer-Meldung, wenn keine Systeme vorhanden sind', () => {
    useSystemeListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <SystemeTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('Noch kein System angelegt. Ein System ist die fachliche Bilanzgrenze, auf die sich eine Einsparberechnung bezieht.')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useSystemeListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <SystemeTabelle />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
