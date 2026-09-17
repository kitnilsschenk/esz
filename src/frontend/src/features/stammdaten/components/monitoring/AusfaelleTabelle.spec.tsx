import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { AusfaelleTabelle } from './AusfaelleTabelle';

const { useAusfaelleListeViewMock } = vi.hoisted(() => ({ useAusfaelleListeViewMock: vi.fn() }));

vi.mock('../../hooks/monitoring', () => ({ useAusfaelleListeView: useAusfaelleListeViewMock }));

describe('AusfaelleTabelle', () => {
  afterEach(() => {
    useAusfaelleListeViewMock.mockReset();
  });

  it('zeigt einen dokumentierten TB-04-Ausfall als „destructive"-Status', () => {
    useAusfaelleListeViewMock.mockReturnValue({
      items: [
        {
          messkanalId: '0198c3aa-aaaa-7000-8000-000000000001',
          zaehlerId: '0198c3aa-bbbb-7000-8000-000000000002',
          letzteUebertragung: '2026-07-18T00:00:00.000Z',
          ueberfaellig: true,
          ausfallStatus: 'andauernd',
          ausfallSeit: '2026-07-18T00:00:00.000Z',
        },
      ],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(<AusfaelleTabelle />);

    expect(screen.getByText('andauernd')).toBeInTheDocument();
  });

  it('zeigt einen NUR überfälligen Kanal (kein dokumentierter Ausfall-Vorgang) als „warning"-Status', () => {
    useAusfaelleListeViewMock.mockReturnValue({
      items: [
        {
          messkanalId: '0198c3aa-aaaa-7000-8000-000000000001',
          zaehlerId: '0198c3aa-bbbb-7000-8000-000000000002',
          letzteUebertragung: '2026-07-18T00:00:00.000Z',
          ueberfaellig: true,
          ausfallStatus: null,
          ausfallSeit: null,
        },
      ],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(<AusfaelleTabelle />);

    expect(screen.getByText('Nur überfällig, kein dokumentierter Ausfall')).toBeInTheDocument();
  });

  it('zeigt die Leer-Meldung, wenn keine Ausfälle vorliegen', () => {
    useAusfaelleListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(<AusfaelleTabelle />);

    expect(screen.getByText('Keine Ausfälle und keine überfälligen Kanäle — die Datenübertragung läuft.')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useAusfaelleListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    const { container } = render(<AusfaelleTabelle />);

    expect(await runAxe(container)).toEqual([]);
  });
});
