import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { VollstaendigkeitTabelle } from './VollstaendigkeitTabelle';

const { useVollstaendigkeitListeViewMock } = vi.hoisted(() => ({
  useVollstaendigkeitListeViewMock: vi.fn(),
}));

vi.mock('../../hooks/monitoring', () => ({ useVollstaendigkeitListeView: useVollstaendigkeitListeViewMock }));

describe('VollstaendigkeitTabelle', () => {
  afterEach(() => {
    useVollstaendigkeitListeViewMock.mockReset();
  });

  it('zeigt Ebene und Lücken je Endkunde als Badges (je Lückentyp ein Badge) — KEINE PII/Verbrauchsfelder', () => {
    useVollstaendigkeitListeViewMock.mockReturnValue({
      items: [
        {
          endkundeId: '0198c3aa-aaaa-7000-8000-000000000001',
          systemId: null,
          zaehlerId: null,
          ebene: 'endkunde',
          luecken: ['kein_messkonzept', 'kein_zaehler'],
          geprueftAm: '2026-07-14T00:00:00.000Z',
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
        <VollstaendigkeitTabelle />
      </MemoryRouter>,
    );

    // „Endkunde" erscheint zweimal: einmal als Spaltenkopf (`endkundeId`),
    // einmal als übersetzter `ebene`-Zellenwert — beide exakt gleich benannt.
    expect(screen.getAllByText('Endkunde')).toHaveLength(2);
    // Jeder Lückentyp ist EIN eigenes Badge (Phase 4c-Feinschliff, statt
    // vormals einer Komma-Liste als Fließtext).
    expect(screen.getByText('Kein Messkonzept')).toBeInTheDocument();
    expect(screen.getByText('Kein Zähler')).toBeInTheDocument();
  });

  it('zeigt die Leer-Meldung, wenn keine Lücken gefunden wurden', () => {
    useVollstaendigkeitListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <VollstaendigkeitTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('Keine Lücken gefunden — alle geprüften Endkunden sind vollständig.')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useVollstaendigkeitListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <VollstaendigkeitTabelle />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
