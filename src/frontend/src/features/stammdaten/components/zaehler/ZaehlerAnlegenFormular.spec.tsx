import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { ZaehlerAnlegenFormular } from './ZaehlerAnlegenFormular';

const { useZaehlerAnlegenViewMock } = vi.hoisted(() => ({
  useZaehlerAnlegenViewMock: vi.fn(),
}));

vi.mock('../../hooks/zaehler', () => ({ useZaehlerAnlegenView: useZaehlerAnlegenViewMock }));

const SYSTEM_OPTIONEN = [{ value: '0198c3aa-aaaa-7000-8000-000000000001', label: 'Bürogebäude (0198c3aa)' }];
const ENERGIETRAEGER_OPTIONEN = [{ value: 'strom', label: 'Strom' }];

describe('ZaehlerAnlegenFormular', () => {
  afterEach(() => {
    useZaehlerAnlegenViewMock.mockReset();
  });

  it('ruft submit erst NACH erfolgreicher Zod-Validierung auf (System/Gerätetyp/Energieträger Pflicht)', () => {
    const submit = vi.fn();
    useZaehlerAnlegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: undefined,
      systemOptionen: SYSTEM_OPTIONEN,
      energietraegerOptionen: ENERGIETRAEGER_OPTIONEN,
      submit,
    });

    render(
      <MemoryRouter>
        <ZaehlerAnlegenFormular />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('System ist erforderlich.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('System'), { target: { value: '0198c3aa-aaaa-7000-8000-000000000001' } });
    fireEvent.change(screen.getByLabelText('Gerätetyp'), { target: { value: 'Wärmemengenzähler' } });
    fireEvent.change(screen.getByLabelText('Energieträger'), { target: { value: 'strom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(submit).toHaveBeenCalledWith({
      systemId: '0198c3aa-aaaa-7000-8000-000000000001',
      geraetetyp: 'Wärmemengenzähler',
      energietraeger: 'strom',
    });
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt', () => {
    useZaehlerAnlegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: 'Zähler konnte nicht angelegt werden.',
      systemOptionen: SYSTEM_OPTIONEN,
      energietraegerOptionen: ENERGIETRAEGER_OPTIONEN,
      submit: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ZaehlerAnlegenFormular />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Zähler konnte nicht angelegt werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useZaehlerAnlegenViewMock.mockReturnValue({
      isSubmitting: false,
      submitErrorMessage: undefined,
      systemOptionen: SYSTEM_OPTIONEN,
      energietraegerOptionen: ENERGIETRAEGER_OPTIONEN,
      submit: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <ZaehlerAnlegenFormular />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
