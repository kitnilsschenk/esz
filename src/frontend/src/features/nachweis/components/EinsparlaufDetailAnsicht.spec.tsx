import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { EinsparlaufDetailAnsicht } from './EinsparlaufDetailAnsicht';

const { useEinsparlaufDetailViewMock, useKannNachweisFuehrenMock } = vi.hoisted(() => ({
  useEinsparlaufDetailViewMock: vi.fn(),
  useKannNachweisFuehrenMock: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useEinsparlaufDetailView: useEinsparlaufDetailViewMock,
  useKannNachweisFuehren: useKannNachweisFuehrenMock,
}));
vi.mock('./EinsparlaufErgebnisseTabelle', () => ({ EinsparlaufErgebnisseTabelle: () => <div /> }));
vi.mock('./EinsparlaufBindungenTabelle', () => ({
  EinsparlaufBindungenTabelle: () => <div data-testid="bindungen" />,
}));
vi.mock('./NachweisExportErzeugenFormular', () => ({
  NachweisExportErzeugenFormular: () => <div data-testid="export-formular" />,
}));

const LAUF_ID = '0198c3cc-cccc-7000-8000-000000000003';

const BASIS = {
  isPending: false,
  isError: false,
  foerderjahrId: '0198c3aa-aaaa-7000-8000-000000000001',
  preflightId: '0198c3bb-bbbb-7000-8000-000000000002',
  ersetztEinsparlaufId: null,
  art: 'foerderjahr_nachweis' as const,
  istEinreichbar: true,
  fields: [{ key: 'art', label: 'Art', value: 'Förderjahr-Nachweis' }],
  summeFields: [{ key: 'summeEinsparung', label: 'Ausgewiesene Einsparung', value: '12.345 kWh' }],
};

function rendere(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <EinsparlaufDetailAnsicht einsparlaufId={LAUF_ID} />
    </MemoryRouter>,
  );
}

describe('EinsparlaufDetailAnsicht', () => {
  afterEach(() => {
    useEinsparlaufDetailViewMock.mockReset();
    useKannNachweisFuehrenMock.mockReset();
  });

  it('lädt die Monatsbindungen erst auf Aufforderung', () => {
    // Es sind Paare × Monate Zeilen — ausgeklappt drängten sie das
    // Jahresergebnis von der Seite.
    useEinsparlaufDetailViewMock.mockReturnValue(BASIS);
    useKannNachweisFuehrenMock.mockReturnValue(true);

    rendere();

    expect(screen.queryByTestId('bindungen')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Monatsbindungen einblenden' }));
    expect(screen.getByTestId('bindungen')).toBeInTheDocument();
  });

  it('sagt beim Zwischenstand vorab, dass er sich nicht einreichen lässt', () => {
    // Der Satz steht dort, wo der Export erzeugt wird — nicht erst hinter
    // einer Fehlermeldung zwei Schritte später.
    useEinsparlaufDetailViewMock.mockReturnValue({ ...BASIS, art: 'zwischenstand', istEinreichbar: false });
    useKannNachweisFuehrenMock.mockReturnValue(true);

    rendere();

    expect(screen.getByText(/einreichen lässt er sich nicht/)).toBeInTheDocument();
  });

  it('blendet den Export-Abschnitt für Rollen ohne Schreibrecht aus', () => {
    useEinsparlaufDetailViewMock.mockReturnValue(BASIS);
    useKannNachweisFuehrenMock.mockReturnValue(false);

    rendere();

    expect(screen.queryByTestId('export-formular')).not.toBeInTheDocument();
  });

  it('verlinkt zurück auf Förderjahr und zugrunde liegende Prüfung', () => {
    useEinsparlaufDetailViewMock.mockReturnValue(BASIS);
    useKannNachweisFuehrenMock.mockReturnValue(true);

    rendere();

    expect(screen.getByRole('link', { name: 'Förderjahr ansehen' })).toHaveAttribute(
      'href',
      `/nachweis/foerderjahre/${BASIS.foerderjahrId}`,
    );
    expect(screen.getByRole('link', { name: 'Zugrunde liegende Prüfung ansehen' })).toHaveAttribute(
      'href',
      `/nachweis/preflights/${BASIS.preflightId}`,
    );
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useEinsparlaufDetailViewMock.mockReturnValue(BASIS);
    useKannNachweisFuehrenMock.mockReturnValue(true);

    const { container } = rendere();

    expect(await runAxe(container)).toEqual([]);
  });
});
