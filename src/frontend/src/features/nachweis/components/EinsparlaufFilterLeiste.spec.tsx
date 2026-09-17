import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { EinsparlaufFilterLeiste } from './EinsparlaufFilterLeiste';

const { useFoerderjahreListeViewMock } = vi.hoisted(() => ({ useFoerderjahreListeViewMock: vi.fn() }));

vi.mock('../hooks', async () => {
  const echt = await vi.importActual<typeof import('../hooks/nachweisFormat')>('../hooks/nachweisFormat');
  return { einsparlaufArtLabel: echt.einsparlaufArtLabel, useFoerderjahreListeView: useFoerderjahreListeViewMock };
});

function filterView(overrides: Record<string, unknown> = {}) {
  return {
    filter: {},
    foerderjahrId: '',
    art: '',
    nurErstlaeufe: false,
    setzeFoerderjahrId: vi.fn(),
    setzeArt: vi.fn(),
    setzeNurErstlaeufe: vi.fn(),
    ...overrides,
  };
}

describe('EinsparlaufFilterLeiste', () => {
  afterEach(() => {
    useFoerderjahreListeViewMock.mockReset();
  });

  it('bietet die angelegten Förderjahre zur Auswahl an', () => {
    useFoerderjahreListeViewMock.mockReturnValue({
      items: [{ id: 'fj-1', code: 'FJ-2027' }],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });
    const view = filterView();

    render(
      <MemoryRouter>
        <EinsparlaufFilterLeiste filterView={view} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Förderjahr'), { target: { value: 'fj-1' } });
    expect(view.setzeFoerderjahrId).toHaveBeenCalledWith('fj-1');
  });

  it('nennt den dritten Filter „Nur Erstläufe" — er blendet Korrekturläufe aus, nicht abgelöste', () => {
    // Der Server filtert auf Läufe ohne Vorgänger. „Nur aktuelle Läufe" wäre
    // eine andere Zusage und in einer Nachweis-Ansicht gefährlich falsch.
    useFoerderjahreListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });
    const view = filterView();

    render(
      <MemoryRouter>
        <EinsparlaufFilterLeiste filterView={view} />
      </MemoryRouter>,
    );

    const kaestchen = screen.getByLabelText('Nur Erstläufe (Korrekturläufe ausblenden)');
    expect(kaestchen).not.toBeChecked();
    fireEvent.click(kaestchen);
    expect(view.setzeNurErstlaeufe).toHaveBeenCalledWith(true);
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useFoerderjahreListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <EinsparlaufFilterLeiste filterView={filterView()} />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
