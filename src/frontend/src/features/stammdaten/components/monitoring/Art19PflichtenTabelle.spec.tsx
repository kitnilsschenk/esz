import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { Art19PflichtenTabelle } from './Art19PflichtenTabelle';

const { useArt19PflichtenViewMock } = vi.hoisted(() => ({ useArt19PflichtenViewMock: vi.fn() }));

vi.mock('../../hooks/art19', () => ({ useArt19PflichtenView: useArt19PflichtenViewMock }));

function zeile(overrides: { offen?: boolean; mitgeteiltAm?: string | null; anlass?: 'einschraenkung_art18' | 'loeschung_art17' } = {}) {
  const offen = overrides.offen ?? true;
  return {
    item: {
      einreichungId: '0198c3aa-dddd-7000-8000-000000000001',
      empfaenger: 'bafa',
      uebermitteltAt: '2026-07-01T00:00:00.000Z',
      subjektTyp: 'endkunde' as const,
      subjektId: '0198c3aa-eeee-7000-8000-000000000002',
      anlass: overrides.anlass ?? ('einschraenkung_art18' as const),
      mitgeteiltAm: overrides.mitgeteiltAm ?? (offen ? null : '2026-08-01T00:00:00.000Z'),
      offen,
    },
    subjektLabel: 'Endkunde',
    anlassLabel: overrides.anlass === 'loeschung_art17' ? 'Löschung (Art. 17)' : 'Einschränkung (Art. 18)',
  };
}

function mockView(zeilen: readonly ReturnType<typeof zeile>[], mitteilen = vi.fn()) {
  useArt19PflichtenViewMock.mockReturnValue({
    zeilen,
    offenAnzahl: zeilen.filter((z) => z.item.offen).length,
    isPending: false,
    isError: false,
    melden: { isSubmitting: false, submitErrorMessage: undefined, erfolgsMeldung: undefined, mitteilen },
  });
  return mitteilen;
}

describe('Art19PflichtenTabelle (A18/A11.12)', () => {
  afterEach(() => {
    useArt19PflichtenViewMock.mockReset();
  });

  it('meldet erst nach Wahl des Weges und reicht ihn durch', () => {
    const mitteilen = mockView([zeile({ offen: true })]);

    render(<Art19PflichtenTabelle />);

    expect(screen.getByRole('button', { name: 'Mitteilung dokumentieren' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Weg der Mitteilung/), { target: { value: 'elektronisch' } });

    fireEvent.click(screen.getByRole('button', { name: 'Mitteilung dokumentieren' }));
    expect(mitteilen).toHaveBeenCalledTimes(1);
    expect(mitteilen.mock.calls[0]?.[1]).toBe('elektronisch');
  });

  // Erfüllte Pflichten bleiben sichtbar — sie sind der Nachweis, dass
  // mitgeteilt wurde. Sie auszublenden würde die Liste zur Aufgabenliste
  // verkürzen.
  it('zeigt erfüllte Pflichten weiterhin, mit Zeitpunkt statt Aktion', () => {
    mockView([zeile({ offen: false })]);

    render(<Art19PflichtenTabelle />);

    expect(screen.getByText(/mitgeteilt am/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mitteilung dokumentieren' })).not.toBeInTheDocument();
  });

  it('unterscheidet die beiden Anlässe — Einschränkung und Löschung', () => {
    mockView([zeile({ anlass: 'einschraenkung_art18' }), zeile({ anlass: 'loeschung_art17' })]);

    render(<Art19PflichtenTabelle />);

    expect(screen.getByText('Einschränkung (Art. 18)')).toBeInTheDocument();
    expect(screen.getByText('Löschung (Art. 17)')).toBeInTheDocument();
  });

  // Der differenzierte Art.-18-Grund verlässt das System nicht (C4 Punkt 6) —
  // diese Liste beschreibt die Sicht des Empfängers und darf ihn nicht zeigen.
  it('zeigt den differenzierten Einschränkungsgrund NICHT', () => {
    mockView([zeile({ offen: true })]);

    const { container } = render(<Art19PflichtenTabelle />);

    expect(container.textContent).not.toMatch(/Richtigkeit|Widerspruch|unrechtmäßig|Rechtsverteidigung/);
  });

  it('sagt verständlich, wenn nichts offen ist', () => {
    mockView([]);

    render(<Art19PflichtenTabelle />);

    expect(screen.getByText(/keine Mitteilungspflicht nach Art. 19/)).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    mockView([zeile({ offen: true })]);

    const { container } = render(<Art19PflichtenTabelle />);

    expect(await runAxe(container)).toEqual([]);
  });
});
