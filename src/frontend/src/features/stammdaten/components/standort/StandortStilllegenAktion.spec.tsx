import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { StandortStilllegenAktion } from './StandortStilllegenAktion';

const { useStandortStilllegenViewMock } = vi.hoisted(() => ({ useStandortStilllegenViewMock: vi.fn() }));

vi.mock('../../hooks/standort', () => ({ useStandortStilllegenView: useStandortStilllegenViewMock }));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';
const STANDORT_ID = '0198c3aa-bbbb-7000-8000-000000000002';

describe('StandortStilllegenAktion', () => {
  afterEach(() => {
    useStandortStilllegenViewMock.mockReset();
  });

  it('deaktiviert die Stilllegen-Aktion, solange kein Grund gewählt ist', () => {
    useStandortStilllegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, stilllegen: vi.fn() });

    render(<StandortStilllegenAktion endkundeId={ENDKUNDE_ID} standortId={STANDORT_ID} onErfolg={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Stilllegen' })).toBeDisabled();
  });

  it('öffnet einen Bestätigungsdialog erst NACH Grund-Auswahl und ruft `stilllegen` erst NACH Bestätigung mit dem gewählten Grund auf', () => {
    const stilllegen = vi.fn();
    useStandortStilllegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, stilllegen });

    render(<StandortStilllegenAktion endkundeId={ENDKUNDE_ID} standortId={STANDORT_ID} onErfolg={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Grund'), { target: { value: 'nutzung_beendet' } });
    expect(screen.getByRole('button', { name: 'Stilllegen' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Stilllegen' }));
    expect(stilllegen).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog', { name: 'Standort stilllegen' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stilllegen' }));

    expect(stilllegen).toHaveBeenCalledWith({ grund: 'nutzung_beendet' });
  });

  it('bricht ab, ohne `stilllegen` aufzurufen, wenn der Dialog abgebrochen wird', () => {
    const stilllegen = vi.fn();
    useStandortStilllegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, stilllegen });

    render(<StandortStilllegenAktion endkundeId={ENDKUNDE_ID} standortId={STANDORT_ID} onErfolg={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Grund'), { target: { value: 'sonstige' } });
    fireEvent.click(screen.getByRole('button', { name: 'Stilllegen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(stilllegen).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useStandortStilllegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: 'Stilllegen nicht möglich: Der Knoten hat noch aktive Kinder oder eine offene Zähler-Verortung.',
      stilllegen: vi.fn(),
    });

    render(<StandortStilllegenAktion endkundeId={ENDKUNDE_ID} standortId={STANDORT_ID} onErfolg={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Stilllegen nicht möglich');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useStandortStilllegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, stilllegen: vi.fn() });

    const { container } = render(<StandortStilllegenAktion endkundeId={ENDKUNDE_ID} standortId={STANDORT_ID} onErfolg={vi.fn()} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
