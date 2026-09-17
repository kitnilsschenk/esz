import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { einreichungVermerkenFormDefaultValues } from '../api';
import { EinreichungVermerkenFormular } from './EinreichungVermerkenFormular';

const { useEinreichungVermerkenViewMock } = vi.hoisted(() => ({ useEinreichungVermerkenViewMock: vi.fn() }));

vi.mock('../hooks', () => ({ useEinreichungVermerkenView: useEinreichungVermerkenViewMock }));

const JETZT = '2026-08-26T14:32:00.000Z';

function view(submit = vi.fn()) {
  return {
    isSubmitting: false,
    submitErrorMessage: undefined,
    artOptionen: [{ value: 'verwendungsnachweis', label: 'Verwendungsnachweis' }],
    uebermittlungswegOptionen: [{ value: 'bscw_manuell', label: 'BSCW (manueller Upload)' }],
    korrekturGrundOptionen: [{ value: 'messwert_korrektur', label: 'Messwert-Korrektur' }],
    defaultValues: einreichungVermerkenFormDefaultValues(JETZT),
    submit,
  };
}

function rendere(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <EinreichungVermerkenFormular exportId="export-1" jetztIso={JETZT} />
    </MemoryRouter>,
  );
}

describe('EinreichungVermerkenFormular', () => {
  afterEach(() => {
    useEinreichungVermerkenViewMock.mockReset();
  });

  it('belegt den Übermittlungs-Zeitpunkt mit „jetzt" in Ortszeit vor', () => {
    useEinreichungVermerkenViewMock.mockReturnValue(view());

    rendere();

    expect(screen.getByLabelText('Übermittelt am')).toHaveValue('2026-08-26T16:32');
  });

  it('sendet den vollständig ausgefüllten Vermerk', () => {
    const submit = vi.fn();
    useEinreichungVermerkenViewMock.mockReturnValue(view(submit));

    rendere();

    fireEvent.change(screen.getByLabelText('Art der Einreichung'), { target: { value: 'verwendungsnachweis' } });
    fireEvent.change(screen.getByLabelText('Übermittlungsweg'), { target: { value: 'bscw_manuell' } });
    fireEvent.click(screen.getByRole('button', { name: 'Einreichung vermerken' }));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ art: 'verwendungsnachweis', uebermittlungsweg: 'bscw_manuell' });
  });

  it('verlangt einen Korrekturgrund, sobald eine Einreichung abgelöst wird', () => {
    const submit = vi.fn();
    useEinreichungVermerkenViewMock.mockReturnValue(view(submit));

    rendere();

    fireEvent.change(screen.getByLabelText('Art der Einreichung'), { target: { value: 'verwendungsnachweis' } });
    fireEvent.change(screen.getByLabelText('Übermittlungsweg'), { target: { value: 'bscw_manuell' } });
    fireEvent.change(screen.getByLabelText('Löst diese Einreichung ab'), {
      target: { value: '0198c3aa-aaaa-7000-8000-000000000001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Einreichung vermerken' }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Bitte einen Korrekturgrund wählen, wenn eine Einreichung abgelöst wird.')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useEinreichungVermerkenViewMock.mockReturnValue(view());

    const { container } = rendere();

    expect(await runAxe(container)).toEqual([]);
  });
});
