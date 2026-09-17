import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { EinschraenkungFristenTabelle } from './EinschraenkungFristenTabelle';

const { useEinschraenkungFristenViewMock } = vi.hoisted(() => ({
  useEinschraenkungFristenViewMock: vi.fn(),
}));

vi.mock('../../hooks/monitoring', () => ({
  useEinschraenkungFristenView: useEinschraenkungFristenViewMock,
}));

function zeile(overrides: {
  subjektTyp?: 'endkunde' | 'anschlussnutzer';
  subjektId?: string;
  tageOffen?: number;
  ueberfaellig?: boolean;
  grundLabel?: string;
} = {}) {
  return {
    item: {
      subjektTyp: overrides.subjektTyp ?? ('endkunde' as const),
      subjektId: overrides.subjektId ?? '0198c3aa-aaaa-7000-8000-000000000001',
      endkundeId: '0198c3aa-aaaa-7000-8000-000000000001',
      einschraenkungGrundCode: 'art18_1a_richtigkeit' as const,
      gesperrtSeit: '2026-07-01T00:00:00.000Z',
      tageOffen: overrides.tageOffen ?? 5,
      ueberfaellig: overrides.ueberfaellig ?? false,
    },
    subjektLabel: overrides.subjektTyp === 'anschlussnutzer' ? 'Anschlussnutzer' : 'Endkunde',
    grundLabel: overrides.grundLabel ?? 'Richtigkeit der Daten wird bestritten (Abs. 1 lit. a)',
  };
}

function mockView(zeilen: readonly ReturnType<typeof zeile>[], ueberfaelligAnzahl = 0): void {
  useEinschraenkungFristenViewMock.mockReturnValue({
    zeilen,
    schwelleTage: 30,
    ueberfaelligAnzahl,
    isPending: false,
    isError: false,
  });
}

describe('EinschraenkungFristenTabelle (A11.11)', () => {
  afterEach(() => {
    useEinschraenkungFristenViewMock.mockReset();
  });

  it('zeigt Grund und Standzeit je Vorgang', () => {
    mockView([zeile({ tageOffen: 12 })]);

    render(<EinschraenkungFristenTabelle />);

    expect(screen.getByText(/Richtigkeit der Daten wird bestritten/)).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  // Die Liste zeigt bewusst auch noch nicht überfällige Vorgänge — sonst
  // sähe die Sachbearbeitung nie, was demnächst fällig wird. Das Abzeichen
  // unterscheidet.
  it('hebt nur die überfälligen Vorgänge hervor', () => {
    mockView(
      [
        zeile({ subjektId: 'a', tageOffen: 5, ueberfaellig: false }),
        zeile({ subjektId: 'b', tageOffen: 40, ueberfaellig: true }),
      ],
      1,
    );

    render(<EinschraenkungFristenTabelle />);

    expect(screen.getByText(/überfällig/)).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // Kopfzeile + zwei Vorgänge
  });

  it('unterscheidet Endkunde und Anschlussnutzer in derselben Liste', () => {
    mockView([
      zeile({ subjektTyp: 'endkunde', subjektId: 'e' }),
      zeile({ subjektTyp: 'anschlussnutzer', subjektId: 'a' }),
    ]);

    render(<EinschraenkungFristenTabelle />);

    expect(screen.getByText(/^Endkunde /)).toBeInTheDocument();
    expect(screen.getByText(/^Anschlussnutzer /)).toBeInTheDocument();
  });

  it('sagt verständlich, wenn nichts offen ist', () => {
    mockView([]);

    render(<EinschraenkungFristenTabelle />);

    expect(screen.getByText(/keine befristete Verarbeitungseinschränkung/)).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    mockView([zeile({ ueberfaellig: true, tageOffen: 40 })], 1);

    const { container } = render(<EinschraenkungFristenTabelle />);

    expect(await runAxe(container)).toEqual([]);
  });
});
