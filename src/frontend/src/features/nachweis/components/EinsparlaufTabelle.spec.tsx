import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { EinsparlaufTabelle } from './EinsparlaufTabelle';

const { useEinsparlaeufeListeViewMock } = vi.hoisted(() => ({ useEinsparlaeufeListeViewMock: vi.fn() }));

vi.mock('../hooks', () => ({ useEinsparlaeufeListeView: useEinsparlaeufeListeViewMock }));

const FOERDERJAHR_ID = '0198c3aa-aaaa-7000-8000-000000000001';

const ZEILE = {
  id: '0198c3cc-cccc-7000-8000-000000000003',
  idLabel: '0198c3cc',
  foerderjahrId: FOERDERJAHR_ID,
  foerderjahrIdLabel: '0198c3aa',
  artLabel: 'Förderjahr-Nachweis',
  qualitaetsStufeLabel: 'belastbar',
  qualitaetsStufeBadgeVariante: 'success' as const,
  istKorrekturlauf: false,
  erstelltAtLabel: '26.08.2026, 16:32',
};

const BASIS = {
  items: [ZEILE],
  isPending: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  loadMore: vi.fn(),
};

describe('EinsparlaufTabelle', () => {
  afterEach(() => {
    useEinsparlaeufeListeViewMock.mockReset();
  });

  it('verlinkt Lauf und Förderjahr', () => {
    useEinsparlaeufeListeViewMock.mockReturnValue(BASIS);

    render(
      <MemoryRouter>
        <EinsparlaufTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Details anzeigen 0198c3cc' })).toHaveAttribute(
      'href',
      `/nachweis/einsparlaeufe/${ZEILE.id}`,
    );
    expect(screen.getByRole('link', { name: '0198c3aa' })).toHaveAttribute('href', `/nachweis/foerderjahre/${FOERDERJAHR_ID}`);
  });

  it('unterscheidet Erstlauf und Korrekturlauf', () => {
    useEinsparlaeufeListeViewMock.mockReturnValue({ ...BASIS, items: [{ ...ZEILE, istKorrekturlauf: true }] });

    render(
      <MemoryRouter>
        <EinsparlaufTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('Korrekturlauf')).toBeInTheDocument();
  });

  it('lässt die Förderjahr-Spalte weg, wenn sie in jeder Zeile gleich wäre', () => {
    useEinsparlaeufeListeViewMock.mockReturnValue(BASIS);

    render(
      <MemoryRouter>
        <EinsparlaufTabelle foerderjahrId={FOERDERJAHR_ID} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('columnheader', { name: 'Förderjahr' })).not.toBeInTheDocument();
    expect(screen.getByText('Gerechnete Läufe mit Stand und Qualitätsstufe')).toBeInTheDocument();
  });

  it('sagt im eingebetteten Leerzustand, wo es weitergeht', () => {
    useEinsparlaeufeListeViewMock.mockReturnValue({ ...BASIS, items: [] });

    render(
      <MemoryRouter>
        <EinsparlaufTabelle foerderjahrId={FOERDERJAHR_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Starten Sie mit der Vollständigkeitsprüfung/)).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useEinsparlaeufeListeViewMock.mockReturnValue(BASIS);

    const { container } = render(
      <MemoryRouter>
        <EinsparlaufTabelle />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
