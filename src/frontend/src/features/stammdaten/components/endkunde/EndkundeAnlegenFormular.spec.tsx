import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { EndkundeAnlegenFormular } from './EndkundeAnlegenFormular';

const { useEndkundeAnlegenViewMock } = vi.hoisted(() => ({
  useEndkundeAnlegenViewMock: vi.fn(),
}));

vi.mock('../../hooks/endkunde', () => ({ useEndkundeAnlegenView: useEndkundeAnlegenViewMock }));

describe('EndkundeAnlegenFormular', () => {
  afterEach(() => {
    useEndkundeAnlegenViewMock.mockReset();
  });

  it('ruft submit erst NACH erfolgreicher Zod-Validierung der Pflichtfelder (Name/Anschrift) auf', () => {
    const submit = vi.fn();
    useEndkundeAnlegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, submit });

    render(
      <MemoryRouter>
        <EndkundeAnlegenFormular />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Name ist erforderlich.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Max Mustermann' } });
    fireEvent.change(screen.getByLabelText('Anschrift'), { target: { value: 'Musterstraße 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(submit).toHaveBeenCalledWith({
      name: 'Max Mustermann',
      anschrift: 'Musterstraße 1',
      kontakt: '',
      endkundengruppe: '',
    });
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useEndkundeAnlegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: 'Endkunde konnte nicht angelegt werden.',
      submit: vi.fn(),
    });

    render(
      <MemoryRouter>
        <EndkundeAnlegenFormular />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Endkunde konnte nicht angelegt werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useEndkundeAnlegenViewMock.mockReturnValue({ isSubmitting: false, submitErrorMessage: undefined, submit: vi.fn() });

    const { container } = render(
      <MemoryRouter>
        <EndkundeAnlegenFormular />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
