import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { standortAnlegenFormSchema, standortAnlegenFormDefaultValues } from '../../api/standort';
import { StandortKindAnlegenFormular } from './StandortKindAnlegenFormular';

const { useStandortKindAnlegenViewMock } = vi.hoisted(() => ({ useStandortKindAnlegenViewMock: vi.fn() }));

vi.mock('../../hooks/standort', () => ({ useStandortKindAnlegenView: useStandortKindAnlegenViewMock }));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';
const PARENT_ID = '0198c3aa-bbbb-7000-8000-000000000002';

const TYP_OPTIONEN = [
  { value: 'gebaeude', label: 'Gebäude' },
  { value: 'raum', label: 'Raum' },
];

function baseView(overrides: Record<string, unknown> = {}, istWurzel = false) {
  return {
    istWurzel,
    schema: standortAnlegenFormSchema(istWurzel),
    defaultValues: standortAnlegenFormDefaultValues(),
    typOptionen: TYP_OPTIONEN,
    adresseHinweis: 'Nur bei Gebäude zulässig, hier optional. Bei anderen Typen unterhalb der Wurzel nicht zulässig.',
    isSubmitting: false,
    submitErrorMessage: undefined,
    submit: vi.fn(),
    ...overrides,
  };
}

describe('StandortKindAnlegenFormular', () => {
  afterEach(() => {
    useStandortKindAnlegenViewMock.mockReset();
  });

  it('zeigt Feldfehler und ruft `submit` NICHT auf, wenn Typ/Bezeichnung fehlen', () => {
    const submit = vi.fn();
    useStandortKindAnlegenViewMock.mockReturnValue(baseView({ submit }));

    render(<StandortKindAnlegenFormular endkundeId={ENDKUNDE_ID} parentId={PARENT_ID} onErfolg={vi.fn()} onAbbrechen={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Kind anlegen' }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Typ ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Bezeichnung ist erforderlich.')).toBeInTheDocument();
  });

  it('ruft `submit` mit den validierten Werten auf, sobald Pflichtfelder ausgefüllt sind', () => {
    const submit = vi.fn();
    useStandortKindAnlegenViewMock.mockReturnValue(baseView({ submit }));

    render(<StandortKindAnlegenFormular endkundeId={ENDKUNDE_ID} parentId={PARENT_ID} onErfolg={vi.fn()} onAbbrechen={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Typ'), { target: { value: 'raum' } });
    fireEvent.change(screen.getByLabelText('Sortierung'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Bezeichnung'), { target: { value: 'Serverraum EG' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kind anlegen' }));

    expect(submit).toHaveBeenCalledWith({
      typ: 'raum',
      sortierung: '3',
      bezeichnung: 'Serverraum EG',
      adresse: '',
      klimareferenz: '',
    });
  });

  it('lehnt eine Adresse bei einem `raum`-Typ ab (D4 — nur Wurzel/gebaeude erlaubt Adresse)', () => {
    const submit = vi.fn();
    useStandortKindAnlegenViewMock.mockReturnValue(baseView({ submit }));

    render(<StandortKindAnlegenFormular endkundeId={ENDKUNDE_ID} parentId={PARENT_ID} onErfolg={vi.fn()} onAbbrechen={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Typ'), { target: { value: 'raum' } });
    fireEvent.change(screen.getByLabelText('Bezeichnung'), { target: { value: 'Serverraum EG' } });
    fireEvent.change(screen.getByLabelText('Adresse'), { target: { value: 'Musterstraße 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kind anlegen' }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText(/Adresse ist auf dieser Ebene nicht zulässig/)).toBeInTheDocument();
  });

  it('zeigt bei der Wurzel-Anlage den Submit-Text „Wurzel anlegen" und erfordert eine Adresse', () => {
    const submit = vi.fn();
    useStandortKindAnlegenViewMock.mockReturnValue(baseView({ submit }, true));

    render(<StandortKindAnlegenFormular endkundeId={ENDKUNDE_ID} parentId={null} onErfolg={vi.fn()} onAbbrechen={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Wurzel anlegen' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Typ'), { target: { value: 'gebaeude' } });
    fireEvent.change(screen.getByLabelText('Bezeichnung'), { target: { value: 'Hauptgebäude' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wurzel anlegen' }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText(/Adresse ist für einen Knoten ohne übergeordneten Knoten erforderlich/)).toBeInTheDocument();
  });

  it('ruft `onAbbrechen` beim Klick auf „Abbrechen" auf', () => {
    const onAbbrechen = vi.fn();
    useStandortKindAnlegenViewMock.mockReturnValue(baseView());

    render(<StandortKindAnlegenFormular endkundeId={ENDKUNDE_ID} parentId={PARENT_ID} onErfolg={vi.fn()} onAbbrechen={onAbbrechen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(onAbbrechen).toHaveBeenCalledTimes(1);
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useStandortKindAnlegenViewMock.mockReturnValue(baseView());

    const { container } = render(
      <StandortKindAnlegenFormular endkundeId={ENDKUNDE_ID} parentId={PARENT_ID} onErfolg={vi.fn()} onAbbrechen={vi.fn()} />,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
