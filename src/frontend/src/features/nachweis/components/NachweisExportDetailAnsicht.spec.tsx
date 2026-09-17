import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { NachweisExportDetailAnsicht } from './NachweisExportDetailAnsicht';

const { useKannNachweisFuehrenMock, useNachweisExportDetailViewMock, useExportEinreichbarkeitViewMock } = vi.hoisted(
  () => ({
    useKannNachweisFuehrenMock: vi.fn(),
    useNachweisExportDetailViewMock: vi.fn(),
    useExportEinreichbarkeitViewMock: vi.fn(),
  }),
);

vi.mock('../hooks', () => ({
  useKannNachweisFuehren: useKannNachweisFuehrenMock,
  useNachweisExportDetailView: useNachweisExportDetailViewMock,
  useExportEinreichbarkeitView: useExportEinreichbarkeitViewMock,
}));
vi.mock('./NachweisExportDateienTabelle', () => ({ NachweisExportDateienTabelle: () => <div /> }));
vi.mock('./EinreichungVermerkenFormular', () => ({
  EinreichungVermerkenFormular: () => <div data-testid="einreichung-formular" />,
}));

const DETAIL = {
  isPending: false,
  isError: false,
  einsparlaufId: '0198c3cc-cccc-7000-8000-000000000003',
  fields: [{ key: 'zweck', label: 'Zweck', value: 'Nachweis' }],
  dateien: [],
};

function rendere(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <NachweisExportDetailAnsicht exportId="export-1" />
    </MemoryRouter>,
  );
}

describe('NachweisExportDetailAnsicht', () => {
  afterEach(() => {
    useKannNachweisFuehrenMock.mockReset();
    useNachweisExportDetailViewMock.mockReset();
    useExportEinreichbarkeitViewMock.mockReset();
  });

  it('verwehrt der Auditor-Rolle die Ansicht vorab, statt eine Fehlerseite zu zeigen', () => {
    // Der Export ist die einzige Leseaktion des Nachweis-Kontexts, die der
    // Auditor-Rolle verwehrt bleibt — der Server antwortet hier mit 403.
    useKannNachweisFuehrenMock.mockReturnValue(false);
    useNachweisExportDetailViewMock.mockReturnValue(DETAIL);
    useExportEinreichbarkeitViewMock.mockReturnValue({ isPending: false, istEinreichbar: false, sperrGrund: undefined });

    rendere();

    expect(screen.getByRole('alert')).toHaveTextContent('Diese Ansicht ist dem Betriebs-Team vorbehalten.');
  });

  it('zeigt das Einreichungs-Formular, wenn der zugrunde liegende Lauf einreichbar ist', () => {
    useKannNachweisFuehrenMock.mockReturnValue(true);
    useNachweisExportDetailViewMock.mockReturnValue(DETAIL);
    useExportEinreichbarkeitViewMock.mockReturnValue({ isPending: false, istEinreichbar: true, sperrGrund: undefined });

    rendere();

    expect(screen.getByTestId('einreichung-formular')).toBeInTheDocument();
  });

  it('nennt statt des Formulars den Grund, wenn kein Vermerk möglich ist', () => {
    // Ein Formular, das beim Absenden sicher scheitert, ist schlechter als
    // eine klare Auskunft davor.
    useKannNachweisFuehrenMock.mockReturnValue(true);
    useNachweisExportDetailViewMock.mockReturnValue(DETAIL);
    useExportEinreichbarkeitViewMock.mockReturnValue({
      isPending: false,
      istEinreichbar: false,
      sperrGrund: 'Dieser Export beruht auf einem Zwischenstand.',
    });

    rendere();

    expect(screen.queryByTestId('einreichung-formular')).not.toBeInTheDocument();
    expect(screen.getByText('Dieser Export beruht auf einem Zwischenstand.')).toBeInTheDocument();
  });

  it('zeigt weder Formular noch Grund, solange die Vorbedingung noch geladen wird', () => {
    useKannNachweisFuehrenMock.mockReturnValue(true);
    useNachweisExportDetailViewMock.mockReturnValue(DETAIL);
    useExportEinreichbarkeitViewMock.mockReturnValue({ isPending: true, istEinreichbar: false, sperrGrund: undefined });

    rendere();

    expect(screen.queryByTestId('einreichung-formular')).not.toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useKannNachweisFuehrenMock.mockReturnValue(true);
    useNachweisExportDetailViewMock.mockReturnValue(DETAIL);
    useExportEinreichbarkeitViewMock.mockReturnValue({ isPending: false, istEinreichbar: true, sperrGrund: undefined });

    const { container } = rendere();

    expect(await runAxe(container)).toEqual([]);
  });
});
