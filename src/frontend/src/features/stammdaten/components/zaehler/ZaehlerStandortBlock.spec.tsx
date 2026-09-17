import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { ZaehlerStandortBlock } from './ZaehlerStandortBlock';

const { useZaehlerStandortViewMock } = vi.hoisted(() => ({ useZaehlerStandortViewMock: vi.fn() }));

vi.mock('../../hooks/zaehler', () => ({ useZaehlerStandortView: useZaehlerStandortViewMock }));

const ZAEHLER_ID = '0198c3aa-aaaa-7000-8000-000000000001';
const ENDKUNDE_ID = '0198c3aa-cccc-7000-8000-000000000003';

const BASIS_VIEW = {
  isPending: false,
  isError: false,
  verortet: false,
  verortetSeit: undefined,
  endkundeId: ENDKUNDE_ID,
  breadcrumb: [],
  zuordnenSchema: undefined,
  zuordnenDefaultValues: { standortId: '', gueltigVon: '' },
  zuordnenIsSubmitting: false,
  zuordnenSubmitErrorMessage: undefined,
  zuordnenSubmit: vi.fn(),
};

describe('ZaehlerStandortBlock', () => {
  afterEach(() => {
    useZaehlerStandortViewMock.mockReset();
  });

  it('zeigt den Empty-State mit CTA „Standort zuordnen", wenn der Zähler unverortet ist', () => {
    useZaehlerStandortViewMock.mockReturnValue(BASIS_VIEW);

    render(
      <MemoryRouter>
        <ZaehlerStandortBlock zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Dieser Zähler ist noch keinem Standort zugeordnet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Standort zuordnen' })).toBeInTheDocument();
  });

  it('zeigt die Breadcrumb inkl. Platzhalter-Optik (KEIN Fehler-Styling), wenn Labels ohne Berechtigung nicht aufgelöst sind', () => {
    useZaehlerStandortViewMock.mockReturnValue({
      ...BASIS_VIEW,
      verortet: true,
      breadcrumb: [
        { id: 'std-1', typLabel: 'Liegenschaft', anzeigeName: 'Liegenschaft (ohne Leseberechtigung)', istPlatzhalter: true },
        { id: 'std-2', typLabel: 'Raum', anzeigeName: 'Raum (ohne Leseberechtigung)', istPlatzhalter: true },
      ],
    });

    render(
      <MemoryRouter>
        <ZaehlerStandortBlock zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText(/ohne Leseberechtigung/)).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Standort öffnen' })).toHaveAttribute(
      'href',
      `/stammdaten/endkunden/${ENDKUNDE_ID}/standorte`,
    );
  });

  it('zeigt die Fehlermeldung, wenn das Laden der Struktur-Query fehlschlägt', () => {
    useZaehlerStandortViewMock.mockReturnValue({ ...BASIS_VIEW, isError: true });

    render(
      <MemoryRouter>
        <ZaehlerStandortBlock zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useZaehlerStandortViewMock.mockReturnValue(BASIS_VIEW);

    const { container } = render(
      <MemoryRouter>
        <ZaehlerStandortBlock zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
