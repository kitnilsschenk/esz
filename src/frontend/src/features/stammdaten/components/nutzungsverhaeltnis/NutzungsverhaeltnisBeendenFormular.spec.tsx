import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { NutzungsverhaeltnisBeendenFormular } from './NutzungsverhaeltnisBeendenFormular';

const { useNutzungsverhaeltnisBeendenViewMock } = vi.hoisted(() => ({
  useNutzungsverhaeltnisBeendenViewMock: vi.fn(),
}));

vi.mock('../../hooks/nutzungsverhaeltnis', () => ({
  useNutzungsverhaeltnisBeendenView: useNutzungsverhaeltnisBeendenViewMock,
}));

const NUTZUNGSVERHAELTNIS_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('NutzungsverhaeltnisBeendenFormular', () => {
  afterEach(() => {
    useNutzungsverhaeltnisBeendenViewMock.mockReset();
  });

  it('ruft submit mit dem gewählten Enddatum auf', () => {
    const submit = vi.fn();
    useNutzungsverhaeltnisBeendenViewMock.mockReturnValue({
      defaultValues: { gueltigBis: '' },
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit,
    });

    render(<NutzungsverhaeltnisBeendenFormular nutzungsverhaeltnisId={NUTZUNGSVERHAELTNIS_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Beenden' }));
    expect(screen.getByText('Gültig-bis-Datum ist erforderlich.')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Gültig bis'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Beenden' }));

    expect(submit).toHaveBeenCalledWith({ gueltigBis: '2026-12-31' });
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useNutzungsverhaeltnisBeendenViewMock.mockReturnValue({
      defaultValues: { gueltigBis: '' },
      isSubmitting: false,
      submitErrorMessage: 'Das Nutzungsverhaeltnis ist bereits mit einem abweichenden Endzeitpunkt beendet.',
      submit: vi.fn(),
    });

    render(<NutzungsverhaeltnisBeendenFormular nutzungsverhaeltnisId={NUTZUNGSVERHAELTNIS_ID} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Das Nutzungsverhaeltnis ist bereits mit einem abweichenden Endzeitpunkt beendet.',
    );
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useNutzungsverhaeltnisBeendenViewMock.mockReturnValue({
      defaultValues: { gueltigBis: '' },
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit: vi.fn(),
    });

    const { container } = render(<NutzungsverhaeltnisBeendenFormular nutzungsverhaeltnisId={NUTZUNGSVERHAELTNIS_ID} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
