import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { NachweisExportErzeugenFormular } from './NachweisExportErzeugenFormular';

const { useNachweisExportErzeugenViewMock } = vi.hoisted(() => ({ useNachweisExportErzeugenViewMock: vi.fn() }));

vi.mock('../hooks', () => ({ useNachweisExportErzeugenView: useNachweisExportErzeugenViewMock }));

const ZWECK_OPTIONEN = [
  { value: 'nachweis', label: 'Nachweis' },
  { value: 'erfolgskontrolle', label: 'Erfolgskontrolle' },
];

function rendere(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <NachweisExportErzeugenFormular einsparlaufId="lauf" />
    </MemoryRouter>,
  );
}

describe('NachweisExportErzeugenFormular', () => {
  afterEach(() => {
    useNachweisExportErzeugenViewMock.mockReset();
  });

  it('bietet weder die wissenschaftliche Auswertung noch eine Wahl der Stationsdarstellung an', () => {
    // Beides wäre ein Weg an einer offenen Auflage vorbei: der eine
    // serverseitig gesperrt, der andere ohne die verlangte Zweitfreigabe.
    useNachweisExportErzeugenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: undefined,
      zweckOptionen: ZWECK_OPTIONEN,
      submit: vi.fn(),
    });

    rendere();

    expect(screen.queryByRole('option', { name: /Wissenschaftliche Auswertung/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Klimastation')).not.toBeInTheDocument();
    expect(screen.queryByText(/Klarname/)).not.toBeInTheDocument();
  });

  it('sendet den gewählten Zweck', () => {
    const submit = vi.fn();
    useNachweisExportErzeugenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: undefined,
      zweckOptionen: ZWECK_OPTIONEN,
      submit,
    });

    rendere();

    fireEvent.change(screen.getByLabelText('Zweck'), { target: { value: 'erfolgskontrolle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export erzeugen' }));

    expect(submit).toHaveBeenCalledWith({ zweck: 'erfolgskontrolle' });
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useNachweisExportErzeugenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: undefined,
      zweckOptionen: ZWECK_OPTIONEN,
      submit: vi.fn(),
    });

    const { container } = rendere();

    expect(await runAxe(container)).toEqual([]);
  });
});
