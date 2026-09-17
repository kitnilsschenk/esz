import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { MesskonzeptVersionenTabelle } from './MesskonzeptVersionenTabelle';

const { useMesskonzeptVersionenListeViewMock } = vi.hoisted(() => ({
  useMesskonzeptVersionenListeViewMock: vi.fn(),
}));

vi.mock('../../hooks/messkonzept', () => ({
  useMesskonzeptVersionenListeView: useMesskonzeptVersionenListeViewMock,
}));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('MesskonzeptVersionenTabelle', () => {
  afterEach(() => {
    useMesskonzeptVersionenListeViewMock.mockReset();
  });

  it('zeigt Version, Typ und Gültigkeitszeitraum', () => {
    useMesskonzeptVersionenListeViewMock.mockReturnValue({
      items: [{ versionNr: 2, typ: 'standard', gueltigVon: '2026-02-01T00:00:00.000Z', gueltigBis: null, createdAt: '2026-02-01T00:00:00.000Z' }],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <MesskonzeptVersionenTabelle endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Details anzeigen/ })).toHaveAttribute(
      'href',
      `/stammdaten/endkunden/${ENDKUNDE_ID}/messkonzept/versionen/2`,
    );
  });

  it('zeigt die Leer-Meldung, wenn noch keine Version vorhanden ist', () => {
    useMesskonzeptVersionenListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <MesskonzeptVersionenTabelle endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Noch keine Messkonzept-Version vorhanden.')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useMesskonzeptVersionenListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <MesskonzeptVersionenTabelle endkundeId={ENDKUNDE_ID} />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
