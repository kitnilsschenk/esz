import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { MesskonzeptVersionDetailAnsicht } from './MesskonzeptVersionDetailAnsicht';

const { useMesskonzeptVersionDetailViewMock } = vi.hoisted(() => ({
  useMesskonzeptVersionDetailViewMock: vi.fn(),
}));

// Holt eigene Daten (TanStack Query) — wie die uebrigen datenladenden
// Abschnitte gestubbt; der eigene Verhaltenstest liegt in
// `SystemgrenzeAbschnitt.spec.tsx`.
vi.mock('./SystemgrenzeAbschnitt', () => ({ SystemgrenzeAbschnitt: () => <p>Systemgrenze (Stub)</p> }));
vi.mock('./BaselinePeriodenAbschnitt', () => ({
  BaselinePeriodenAbschnitt: () => <p>Baseline-Perioden (Stub)</p>,
}));

vi.mock('../../hooks/messkonzept', () => ({
  useMesskonzeptVersionDetailView: useMesskonzeptVersionDetailViewMock,
}));

const ENDKUNDE_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('MesskonzeptVersionDetailAnsicht', () => {
  afterEach(() => {
    useMesskonzeptVersionDetailViewMock.mockReset();
  });

  it('zeigt die TB-01-Kernfelder sowie die Energieträger/Baseline-Zeilen', () => {
    useMesskonzeptVersionDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [{ key: 'typ', label: 'Typ', value: 'Standard' }],
      energietraeger: [
        {
          energietraeger: 'strom',
          baselineWert: 1234.5,
          baselineEinheit: 'kWh',
          baselineMethode: null,
          baselineBegruendung: null,
          baselineBelegRef: null,
          energietraegerSubstitution: false,
        },
      ],
    });

    render(
      <MemoryRouter>
        <MesskonzeptVersionDetailAnsicht endkundeId={ENDKUNDE_ID} versionNr={1} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Strom')).toBeInTheDocument();
    expect(screen.getByText('kWh')).toBeInTheDocument();
  });

  // ADR-0007 O-B3b — ohne diese Spalte waere der Ausschluss des Endkunden im
  // BAFA-Nachweis von der Oberflaeche aus nicht erklaerbar.
  it('weist eine gesetzte Energieträger-Substitution in der Tabelle aus', () => {
    useMesskonzeptVersionDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [{ key: 'typ', label: 'Typ', value: 'Standard' }],
      energietraeger: [
        {
          energietraeger: 'oel',
          baselineWert: 4200,
          baselineEinheit: 'kWh',
          baselineMethode: null,
          baselineBegruendung: null,
          baselineBelegRef: null,
          energietraegerSubstitution: true,
        },
      ],
    });

    render(
      <MemoryRouter>
        <MesskonzeptVersionDetailAnsicht endkundeId={ENDKUNDE_ID} versionNr={1} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Substitution')).toBeInTheDocument();
    expect(screen.getByText('Ja')).toBeInTheDocument();
  });

  it('zeigt die Fehlermeldung, wenn das Laden fehlschlägt', () => {
    useMesskonzeptVersionDetailViewMock.mockReturnValue({ isPending: false, isError: true, fields: [], energietraeger: [] });

    render(
      <MemoryRouter>
        <MesskonzeptVersionDetailAnsicht endkundeId={ENDKUNDE_ID} versionNr={1} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useMesskonzeptVersionDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [{ key: 'typ', label: 'Typ', value: 'Standard' }],
      energietraeger: [],
    });

    const { container } = render(
      <MemoryRouter>
        <MesskonzeptVersionDetailAnsicht endkundeId={ENDKUNDE_ID} versionNr={1} />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
