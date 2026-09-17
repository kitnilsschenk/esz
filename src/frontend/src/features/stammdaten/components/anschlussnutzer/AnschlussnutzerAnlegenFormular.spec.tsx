import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { AnschlussnutzerAnlegenFormular } from './AnschlussnutzerAnlegenFormular';

const { useAnschlussnutzerAnlegenViewMock } = vi.hoisted(() => ({
  useAnschlussnutzerAnlegenViewMock: vi.fn(),
}));

vi.mock('../../hooks/anschlussnutzer', () => ({ useAnschlussnutzerAnlegenView: useAnschlussnutzerAnlegenViewMock }));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

const BASE_VIEW = {
  isSubmitting: false,
  submitErrorMessage: undefined,
  endkundeOptionen: [{ value: ENDKUNDE_ID, label: '0198c3aa (aktiv)' }],
};

describe('AnschlussnutzerAnlegenFormular', () => {
  afterEach(() => {
    useAnschlussnutzerAnlegenViewMock.mockReset();
  });

  it('ruft submit erst NACH erfolgreicher Zod-Validierung auf (Endkunde/Name Pflicht)', () => {
    const submit = vi.fn();
    useAnschlussnutzerAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit });

    render(
      <MemoryRouter>
        <AnschlussnutzerAnlegenFormular />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Endkunde ist erforderlich.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Endkunde'), { target: { value: ENDKUNDE_ID } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Erika Musterfrau' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(submit).toHaveBeenCalledWith({ endkundeId: ENDKUNDE_ID, name: 'Erika Musterfrau', kontakt: '' });
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useAnschlussnutzerAnlegenViewMock.mockReturnValue({
      ...BASE_VIEW,
      submitErrorMessage: 'Anschlussnutzer konnte nicht angelegt werden.',
      submit: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AnschlussnutzerAnlegenFormular />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Anschlussnutzer konnte nicht angelegt werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useAnschlussnutzerAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit: vi.fn() });

    const { container } = render(
      <MemoryRouter>
        <AnschlussnutzerAnlegenFormular />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
