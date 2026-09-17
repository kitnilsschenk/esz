import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { FoerderjahrDetailAnsicht } from './FoerderjahrDetailAnsicht';

const { useFoerderjahrDetailViewMock } = vi.hoisted(() => ({ useFoerderjahrDetailViewMock: vi.fn() }));

vi.mock('../hooks', () => ({ useFoerderjahrDetailView: useFoerderjahrDetailViewMock }));
vi.mock('./PreflightAusfuehrenAktion', () => ({
  PreflightAusfuehrenAktion: () => <div data-testid="preflight-aktion" />,
}));
vi.mock('./EinsparlaufTabelle', () => ({ EinsparlaufTabelle: () => <div data-testid="einsparlauf-tabelle" /> }));

const FOERDERJAHR_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('FoerderjahrDetailAnsicht', () => {
  afterEach(() => {
    useFoerderjahrDetailViewMock.mockReset();
  });

  it('trägt die Kennung des Förderjahres als Überschrift', () => {
    useFoerderjahrDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      code: 'FJ-2027',
      fields: [{ key: 'code', label: 'Kennung', value: 'FJ-2027' }],
    });

    render(
      <MemoryRouter>
        <FoerderjahrDetailAnsicht foerderjahrId={FOERDERJAHR_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('FJ-2027');
  });

  it('führt Prüfung und Läufe in der Reihenfolge der Kette — erst prüfen, dann rechnen', () => {
    useFoerderjahrDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      code: 'FJ-2027',
      fields: [],
    });

    const { container } = render(
      <MemoryRouter>
        <FoerderjahrDetailAnsicht foerderjahrId={FOERDERJAHR_ID} />
      </MemoryRouter>,
    );

    const aktion = screen.getByTestId('preflight-aktion');
    const tabelle = screen.getByTestId('einsparlauf-tabelle');
    expect(aktion.compareDocumentPosition(tabelle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container).toBeTruthy();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useFoerderjahrDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      code: 'FJ-2027',
      fields: [{ key: 'code', label: 'Kennung', value: 'FJ-2027' }],
    });

    const { container } = render(
      <MemoryRouter>
        <FoerderjahrDetailAnsicht foerderjahrId={FOERDERJAHR_ID} />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
