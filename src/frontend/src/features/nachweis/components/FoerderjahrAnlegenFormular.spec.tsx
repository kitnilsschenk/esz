import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { FoerderjahrAnlegenFormular } from './FoerderjahrAnlegenFormular';

const { useFoerderjahrAnlegenViewMock } = vi.hoisted(() => ({ useFoerderjahrAnlegenViewMock: vi.fn() }));

vi.mock('../hooks', async () => {
  const echt = await vi.importActual<typeof import('../hooks/nachweisFormat')>('../hooks/nachweisFormat');
  return { definitionQuelleLabel: echt.definitionQuelleLabel, useFoerderjahrAnlegenView: useFoerderjahrAnlegenViewMock };
});

describe('FoerderjahrAnlegenFormular', () => {
  afterEach(() => {
    useFoerderjahrAnlegenViewMock.mockReset();
  });

  it('ruft submit erst NACH erfolgreicher Zod-Validierung auf', () => {
    const submit = vi.fn();
    useFoerderjahrAnlegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, submit });

    render(
      <MemoryRouter>
        <FoerderjahrAnlegenFormular />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Förderjahr anlegen' }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Bitte eine Kennung angeben.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Kennung'), { target: { value: 'FJ-2027' } });
    fireEvent.change(screen.getByLabelText('Projektjahr'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Erster Monat'), { target: { value: '2027-01-01' } });
    fireEvent.change(screen.getByLabelText('Letzter Monat'), { target: { value: '2027-12-01' } });
    fireEvent.change(screen.getByLabelText('Zuschnitt'), { target: { value: 'kalenderjahr' } });
    fireEvent.change(screen.getByLabelText('Aktenzeichen'), { target: { value: 'AZ-4711' } });
    fireEvent.click(screen.getByRole('button', { name: 'Förderjahr anlegen' }));

    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('weist einen Monat ab, der nicht der Monatserste ist', () => {
    const submit = vi.fn();
    useFoerderjahrAnlegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, submit });

    render(
      <MemoryRouter>
        <FoerderjahrAnlegenFormular />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Kennung'), { target: { value: 'FJ-2027' } });
    fireEvent.change(screen.getByLabelText('Projektjahr'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Erster Monat'), { target: { value: '2027-01-15' } });
    fireEvent.change(screen.getByLabelText('Letzter Monat'), { target: { value: '2027-12-01' } });
    fireEvent.change(screen.getByLabelText('Zuschnitt'), { target: { value: 'kalenderjahr' } });
    fireEvent.change(screen.getByLabelText('Aktenzeichen'), { target: { value: 'AZ-4711' } });
    fireEvent.click(screen.getByRole('button', { name: 'Förderjahr anlegen' }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getAllByText('Bitte den ersten Tag des Monats wählen.').length).toBeGreaterThan(0);
  });

  it('zeigt eine Server-Fehlermeldung, wenn das Anlegen fehlschlägt', () => {
    useFoerderjahrAnlegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: 'Die Kennung ist bereits vergeben.',
      submit: vi.fn(),
    });

    render(
      <MemoryRouter>
        <FoerderjahrAnlegenFormular />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Die Kennung ist bereits vergeben.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useFoerderjahrAnlegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: undefined,
      submit: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <FoerderjahrAnlegenFormular />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
