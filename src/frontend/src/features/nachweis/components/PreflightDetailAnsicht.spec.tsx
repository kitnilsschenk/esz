import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { PreflightDetailAnsicht } from './PreflightDetailAnsicht';

const { useKannNachweisFuehrenMock, usePreflightDetailViewMock } = vi.hoisted(() => ({
  useKannNachweisFuehrenMock: vi.fn(),
  usePreflightDetailViewMock: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useKannNachweisFuehren: useKannNachweisFuehrenMock,
  usePreflightDetailView: usePreflightDetailViewMock,
}));
// Die Befundliste hat einen eigenen Test; hier interessiert nur die Weiche.
vi.mock('./PreflightBefundeTabelle', () => ({ PreflightBefundeTabelle: () => <div /> }));

const PREFLIGHT_ID = '0198c3bb-bbbb-7000-8000-000000000002';

const GRUEN = {
  isPending: false,
  isError: false,
  foerderjahrId: '0198c3aa-aaaa-7000-8000-000000000001',
  ergebnis: 'gruen' as const,
  istGruen: true,
  ergebnisLabel: 'grün',
  ergebnisBadgeVariante: 'success' as const,
  fields: [{ key: 'blockerAnzahl', label: 'Blocker', value: '0' }],
};

const ROT = { ...GRUEN, ergebnis: 'rot' as const, istGruen: false, ergebnisLabel: 'rot', ergebnisBadgeVariante: 'destructive' as const };

function rendere(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <PreflightDetailAnsicht preflightId={PREFLIGHT_ID} />
    </MemoryRouter>,
  );
}

describe('PreflightDetailAnsicht', () => {
  afterEach(() => {
    useKannNachweisFuehrenMock.mockReset();
    usePreflightDetailViewMock.mockReset();
  });

  it('sagt bei bestandener Prüfung, dass ein Förderjahr-Nachweis darauf aufsetzen kann', () => {
    useKannNachweisFuehrenMock.mockReturnValue(true);
    usePreflightDetailViewMock.mockReturnValue(GRUEN);

    rendere();

    expect(screen.getByText('Prüfung bestanden')).toBeInTheDocument();
    expect(screen.getByText(/Aus dieser Prüfung kann jetzt ein Einspar-Lauf/)).toBeInTheDocument();
  });

  it('benennt bei nicht bestandener Prüfung die Einschränkung, statt den Weg zu verstellen', () => {
    // Ein Zwischenstand bleibt zulässig — die Ansicht sagt nur, dass daraus
    // kein Förderjahr-Nachweis wird.
    useKannNachweisFuehrenMock.mockReturnValue(true);
    usePreflightDetailViewMock.mockReturnValue(ROT);

    rendere();

    expect(screen.getByText('Prüfung nicht bestanden')).toBeInTheDocument();
    expect(screen.getByText(/lässt sich nur ein Zwischenstand rechnen/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einspar-Lauf starten' })).toHaveAttribute(
      'href',
      `/nachweis/preflights/${PREFLIGHT_ID}/einsparlauf-neu`,
    );
  });

  it('blendet den Weiterweg für Rollen ohne Schreibrecht aus', () => {
    useKannNachweisFuehrenMock.mockReturnValue(false);
    usePreflightDetailViewMock.mockReturnValue(GRUEN);

    rendere();

    expect(screen.queryByRole('link', { name: 'Einspar-Lauf starten' })).not.toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useKannNachweisFuehrenMock.mockReturnValue(true);
    usePreflightDetailViewMock.mockReturnValue(GRUEN);

    const { container } = rendere();

    expect(await runAxe(container)).toEqual([]);
  });
});
