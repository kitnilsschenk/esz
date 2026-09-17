import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { AusfallKachel } from './AusfallKachel';

const { useAusfallKachelViewMock } = vi.hoisted(() => ({ useAusfallKachelViewMock: vi.fn() }));

vi.mock('../hooks', () => ({ useAusfallKachelView: useAusfallKachelViewMock }));

describe('AusfallKachel', () => {
  afterEach(() => {
    useAusfallKachelViewMock.mockReset();
  });

  it('zeigt „0" und den `ok`-Ton bei LEERER Liste (kein Ausfall)', () => {
    useAusfallKachelViewMock.mockReturnValue({ isPending: false, isError: false, anzahlZaehler: 0, hatWeitere: false, hatAusfall: false });

    render(
      <MemoryRouter>
        <AusfallKachel />
      </MemoryRouter>,
    );

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Zähler mit Datenausfall' })).toBeInTheDocument();
  });

  it('zeigt die Anzahl (mit „+" bei weiteren Seiten) bei GEFÜLLTER Liste', () => {
    useAusfallKachelViewMock.mockReturnValue({ isPending: false, isError: false, anzahlZaehler: 12, hatWeitere: true, hatAusfall: true });

    render(
      <MemoryRouter>
        <AusfallKachel />
      </MemoryRouter>,
    );

    expect(screen.getByText('12+')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Störungen ansehen' })).toHaveAttribute('href', '/monitoring/vollstaendigkeit');
  });

  it('zeigt den Ladehinweis, solange die Ausfall-Query noch lädt', () => {
    useAusfallKachelViewMock.mockReturnValue({ isPending: true, isError: false, anzahlZaehler: 0, hatWeitere: false, hatAusfall: false });

    render(
      <MemoryRouter>
        <AusfallKachel />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Daten werden geladen …');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useAusfallKachelViewMock.mockReturnValue({ isPending: false, isError: false, anzahlZaehler: 3, hatWeitere: false, hatAusfall: true });

    const { container } = render(
      <MemoryRouter>
        <AusfallKachel />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
