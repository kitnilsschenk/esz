import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { NutzungsverhaeltnisDetailAnsicht } from './NutzungsverhaeltnisDetailAnsicht';

const { useNutzungsverhaeltnisDetailViewMock } = vi.hoisted(() => ({
  useNutzungsverhaeltnisDetailViewMock: vi.fn(),
}));

vi.mock('../../hooks/nutzungsverhaeltnis', () => ({
  useNutzungsverhaeltnisDetailView: useNutzungsverhaeltnisDetailViewMock,
}));
// Eigene Testdatei: `NutzungsverhaeltnisBeendenFormular.spec.tsx` — hier
// bewusst als No-Op gemockt.
vi.mock('./NutzungsverhaeltnisBeendenFormular', () => ({ NutzungsverhaeltnisBeendenFormular: () => null }));

const NUTZUNGSVERHAELTNIS_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('NutzungsverhaeltnisDetailAnsicht', () => {
  afterEach(() => {
    useNutzungsverhaeltnisDetailViewMock.mockReset();
  });

  it('zeigt die Nicht-PII-Kernfelder eines Nutzungsverhältnisses', () => {
    useNutzungsverhaeltnisDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [
        { key: 'id', label: 'ID', value: '0198c3aa' },
        { key: 'rolle', label: 'Rolle', value: 'Mieter' },
      ],
      istBeendet: false,
    });

    render(
      <MemoryRouter>
        <NutzungsverhaeltnisDetailAnsicht nutzungsverhaeltnisId={NUTZUNGSVERHAELTNIS_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Mieter')).toBeInTheDocument();
  });

  it('zeigt den Beendet-Hinweis statt des „Beenden"-Formulars, wenn das Verhältnis bereits beendet ist', () => {
    useNutzungsverhaeltnisDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      istBeendet: true,
    });

    render(
      <MemoryRouter>
        <NutzungsverhaeltnisDetailAnsicht nutzungsverhaeltnisId={NUTZUNGSVERHAELTNIS_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Dieses Nutzungsverhältnis ist bereits beendet.')).toBeInTheDocument();
  });

  it('zeigt die Fehlermeldung, wenn das Laden fehlschlägt', () => {
    useNutzungsverhaeltnisDetailViewMock.mockReturnValue({ isPending: false, isError: true, fields: [], istBeendet: false });

    render(
      <MemoryRouter>
        <NutzungsverhaeltnisDetailAnsicht nutzungsverhaeltnisId={NUTZUNGSVERHAELTNIS_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useNutzungsverhaeltnisDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      istBeendet: false,
    });

    const { container } = render(
      <MemoryRouter>
        <NutzungsverhaeltnisDetailAnsicht nutzungsverhaeltnisId={NUTZUNGSVERHAELTNIS_ID} />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
