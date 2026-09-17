import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { SystemAnlegenFormular } from './SystemAnlegenFormular';

const { useSystemAnlegenViewMock } = vi.hoisted(() => ({
  useSystemAnlegenViewMock: vi.fn(),
}));

vi.mock('../../hooks/system', () => ({ useSystemAnlegenView: useSystemAnlegenViewMock }));

const ENDKUNDE_OPTIONEN = [{ value: '0198c3aa-aaaa-7000-8000-000000000001', label: '0198c3aa (aktiv)' }];

describe('SystemAnlegenFormular', () => {
  afterEach(() => {
    useSystemAnlegenViewMock.mockReset();
  });

  it('ruft submit erst NACH erfolgreicher Zod-Validierung auf (Endkunde/Bezeichnung/Systemgrenze Pflicht)', () => {
    const submit = vi.fn();
    useSystemAnlegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: undefined,
      endkundeOptionen: ENDKUNDE_OPTIONEN,
      submit,
    });

    render(
      <MemoryRouter>
        <SystemAnlegenFormular />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Endkunde ist erforderlich.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Endkunde'), {
      target: { value: '0198c3aa-aaaa-7000-8000-000000000001' },
    });
    fireEvent.change(screen.getByLabelText('Bezeichnung'), { target: { value: 'Bürogebäude Hauptstraße' } });
    fireEvent.change(screen.getByLabelText('Systemgrenze'), { target: { value: 'Gesamtes Gebäude inkl. Keller' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(submit).toHaveBeenCalledWith({
      endkundeId: '0198c3aa-aaaa-7000-8000-000000000001',
      bezeichnung: 'Bürogebäude Hauptstraße',
      systemgrenze: 'Gesamtes Gebäude inkl. Keller',
      systembeschreibung: '',
    });
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useSystemAnlegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: 'System konnte nicht angelegt werden.',
      endkundeOptionen: ENDKUNDE_OPTIONEN,
      submit: vi.fn(),
    });

    render(
      <MemoryRouter>
        <SystemAnlegenFormular />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('System konnte nicht angelegt werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useSystemAnlegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: undefined,
      endkundeOptionen: ENDKUNDE_OPTIONEN,
      submit: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <SystemAnlegenFormular />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
