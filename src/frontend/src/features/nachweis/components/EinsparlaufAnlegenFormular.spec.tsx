import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { EinsparlaufAnlegenFormular } from './EinsparlaufAnlegenFormular';

const { useEinsparlaufAnlegenViewMock } = vi.hoisted(() => ({ useEinsparlaufAnlegenViewMock: vi.fn() }));

vi.mock('../hooks', () => ({ useEinsparlaufAnlegenView: useEinsparlaufAnlegenViewMock }));

const FOERDERJAHR_ID = '0198c3aa-aaaa-7000-8000-000000000001';
const PREFLIGHT_ID = '0198c3bb-bbbb-7000-8000-000000000002';

const AUSLOESER_OPTIONEN = [
  { value: 'manuell', label: 'manuell' },
  { value: 'korrektur', label: 'Korrektur' },
];

function view(artOptionen: readonly { value: string; label: string }[], submit = vi.fn()) {
  return {
    isSubmitting: false,
    submitErrorMessage: undefined,
    artOptionen,
    ausloeserOptionen: AUSLOESER_OPTIONEN,
    vorgaengerOptionen: [],
    vorgaengerOptionenHinweis: undefined,
    submit,
  };
}

function rendere(preflightIstGruen: boolean): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <EinsparlaufAnlegenFormular
        foerderjahrId={FOERDERJAHR_ID}
        preflightId={PREFLIGHT_ID}
        preflightIstGruen={preflightIstGruen}
      />
    </MemoryRouter>,
  );
}

describe('EinsparlaufAnlegenFormular', () => {
  afterEach(() => {
    useEinsparlaufAnlegenViewMock.mockReset();
  });

  it('bietet nach bestandener Prüfung beide Arten an', () => {
    useEinsparlaufAnlegenViewMock.mockReturnValue(
      view([
        { value: 'foerderjahr_nachweis', label: 'Förderjahr-Nachweis' },
        { value: 'zwischenstand', label: 'Zwischenstand' },
      ]),
    );

    rendere(true);

    expect(screen.getByRole('option', { name: 'Förderjahr-Nachweis' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Zwischenstand' })).toBeInTheDocument();
  });

  it('bietet den Förderjahr-Nachweis nach NICHT bestandener Prüfung gar nicht erst an', () => {
    // Der Server lehnt die Kombination ab. Eine Auswahl, die verlässlich in
    // einen Konflikt läuft, ist ein Fehler in der Oberfläche.
    useEinsparlaufAnlegenViewMock.mockReturnValue(view([{ value: 'zwischenstand', label: 'Zwischenstand' }]));

    rendere(false);

    expect(screen.queryByRole('option', { name: 'Förderjahr-Nachweis' })).not.toBeInTheDocument();
    expect(screen.getByText(/steht nur der Zwischenstand zur Wahl/)).toBeInTheDocument();
  });

  it('sendet erst nach gewählter Art', () => {
    const submit = vi.fn();
    useEinsparlaufAnlegenViewMock.mockReturnValue(view([{ value: 'zwischenstand', label: 'Zwischenstand' }], submit));

    rendere(false);

    fireEvent.click(screen.getByRole('button', { name: 'Einspar-Lauf starten' }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Bitte die Art des Laufs wählen.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Art des Laufs'), { target: { value: 'zwischenstand' } });
    fireEvent.click(screen.getByRole('button', { name: 'Einspar-Lauf starten' }));

    expect(submit).toHaveBeenCalledWith({ art: 'zwischenstand', ausloeser: 'manuell', ersetztEinsparlaufId: '' });
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useEinsparlaufAnlegenViewMock.mockReturnValue(view([{ value: 'zwischenstand', label: 'Zwischenstand' }]));

    const { container } = rendere(false);

    expect(await runAxe(container)).toEqual([]);
  });
});
