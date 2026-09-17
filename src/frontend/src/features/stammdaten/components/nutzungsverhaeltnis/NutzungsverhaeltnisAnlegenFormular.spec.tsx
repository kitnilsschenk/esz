import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { NutzungsverhaeltnisAnlegenFormular } from './NutzungsverhaeltnisAnlegenFormular';

const { useNutzungsverhaeltnisAnlegenViewMock } = vi.hoisted(() => ({
  useNutzungsverhaeltnisAnlegenViewMock: vi.fn(),
}));

vi.mock('../../hooks/nutzungsverhaeltnis', () => ({
  useNutzungsverhaeltnisAnlegenView: useNutzungsverhaeltnisAnlegenViewMock,
}));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';
const ANSCHLUSSNUTZER_ID = '0298c3bb-bbbb-7000-8000-000000000002';
const SYSTEM_ID = '0398c3cc-cccc-7000-8000-000000000003';

const BASE_VIEW = {
  isSubmitting: false,
  submitErrorMessage: undefined,
  endkundeOptionen: [{ value: ENDKUNDE_ID, label: '0198c3aa' }],
  anschlussnutzerOptionen: [{ value: ANSCHLUSSNUTZER_ID, label: '0298c3bb' }],
  systemOptionen: [{ value: SYSTEM_ID, label: `Bürogebäude (0398c3cc)` }],
  datenklasseOptionen: [
    { value: 'abrechnungsminimum', label: 'Abrechnungsminimum' },
    { value: 'detailverbrauch', label: 'Detailverbrauch' },
  ],
  rolleOptionen: [{ value: 'mieter', label: 'Mieter' }],
};

describe('NutzungsverhaeltnisAnlegenFormular', () => {
  afterEach(() => {
    useNutzungsverhaeltnisAnlegenViewMock.mockReset();
  });

  it('ruft submit erst NACH erfolgreicher Zod-Validierung auf (alle Referenz-/Enum-Felder Pflicht)', () => {
    const submit = vi.fn();
    useNutzungsverhaeltnisAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit });

    render(
      <MemoryRouter>
        <NutzungsverhaeltnisAnlegenFormular />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Endkunde ist erforderlich.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Endkunde'), { target: { value: ENDKUNDE_ID } });
    fireEvent.change(screen.getByLabelText('Anschlussnutzer'), { target: { value: ANSCHLUSSNUTZER_ID } });
    fireEvent.change(screen.getByLabelText('System'), { target: { value: SYSTEM_ID } });
    fireEvent.change(screen.getByLabelText('Rolle'), { target: { value: 'mieter' } });
    fireEvent.change(screen.getByLabelText('Gültig von'), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anlegen' }));

    expect(submit).toHaveBeenCalledWith({
      endkundeId: ENDKUNDE_ID,
      anschlussnutzerId: ANSCHLUSSNUTZER_ID,
      systemId: SYSTEM_ID,
      datenklasse: 'abrechnungsminimum',
      rolle: 'mieter',
      gueltigVon: '2026-01-01',
    });
  });

  it('zeigt eine Server-Fehlermeldung, wenn die Mutation fehlschlägt (z. B. Referenzkonsistenz-Konflikt)', () => {
    useNutzungsverhaeltnisAnlegenViewMock.mockReturnValue({
      ...BASE_VIEW,
      submitErrorMessage: 'anschlussnutzerId gehoert nicht zum angegebenen endkundeId.',
      submit: vi.fn(),
    });

    render(
      <MemoryRouter>
        <NutzungsverhaeltnisAnlegenFormular />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('anschlussnutzerId gehoert nicht zum angegebenen endkundeId.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useNutzungsverhaeltnisAnlegenViewMock.mockReturnValue({ ...BASE_VIEW, submit: vi.fn() });

    const { container } = render(
      <MemoryRouter>
        <NutzungsverhaeltnisAnlegenFormular />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
