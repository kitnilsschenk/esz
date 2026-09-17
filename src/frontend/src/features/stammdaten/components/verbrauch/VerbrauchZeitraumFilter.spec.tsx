import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { VerbrauchZeitraumFilter } from './VerbrauchZeitraumFilter';

function renderFilter(overrides: Partial<Parameters<typeof VerbrauchZeitraumFilter>[0]> = {}) {
  const props = {
    vonDatum: '2026-07-01',
    bisDatum: '2026-07-14',
    aufloesung: 'tag' as const,
    inklusiveUnterknoten: true,
    zeitraumUngueltig: false,
    onVonDatumChange: vi.fn(),
    onBisDatumChange: vi.fn(),
    onAufloesungChange: vi.fn(),
    onInklusiveUnterknotenChange: vi.fn(),
    ...overrides,
  };
  render(<VerbrauchZeitraumFilter {...props} />);
  return props;
}

describe('VerbrauchZeitraumFilter', () => {
  it('zeigt die übergebenen Werte in Von/Bis/Auflösung/Checkbox korrekt an', () => {
    renderFilter({ aufloesung: 'monat' });

    expect(screen.getByLabelText('Von')).toHaveValue('2026-07-01');
    expect(screen.getByLabelText('Bis')).toHaveValue('2026-07-14');
    expect(screen.getByLabelText('Auflösung')).toHaveValue('monat');
    expect(screen.getByLabelText('Inkl. Unterknoten')).toBeChecked();
  });

  it('meldet Änderungen an Von/Bis/Auflösung/Checkbox an die Aufrufer-Callbacks', () => {
    const props = renderFilter();

    fireEvent.change(screen.getByLabelText('Von'), { target: { value: '2026-06-01' } });
    expect(props.onVonDatumChange).toHaveBeenCalledWith('2026-06-01');

    fireEvent.change(screen.getByLabelText('Bis'), { target: { value: '2026-06-30' } });
    expect(props.onBisDatumChange).toHaveBeenCalledWith('2026-06-30');

    fireEvent.change(screen.getByLabelText('Auflösung'), { target: { value: 'stunde' } });
    expect(props.onAufloesungChange).toHaveBeenCalledWith('stunde');

    fireEvent.click(screen.getByLabelText('Inkl. Unterknoten'));
    expect(props.onInklusiveUnterknotenChange).toHaveBeenCalledWith(false);
  });

  it('zeigt eine `aria-live`-Fehlermeldung, die BEIDE Datumsfelder per `aria-describedby` referenzieren, wenn der Zeitraum ungültig ist', () => {
    renderFilter({ zeitraumUngueltig: true });

    const fehler = screen.getByRole('alert');
    expect(fehler).toHaveTextContent('„Von" muss vor „Bis" liegen.');
    expect(fehler).toHaveAttribute('aria-live', 'polite');

    const von = screen.getByLabelText('Von');
    const bis = screen.getByLabelText('Bis');
    expect(von.getAttribute('aria-describedby')).toBe(fehler.id);
    expect(bis.getAttribute('aria-describedby')).toBe(fehler.id);
    expect(von).toHaveAttribute('aria-invalid', 'true');
    expect(bis).toHaveAttribute('aria-invalid', 'true');
  });

  it('zeigt KEINE Fehlermeldung bei gültigem Zeitraum', () => {
    renderFilter({ zeitraumUngueltig: false });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße (gültiger UND ungültiger Zustand)', async () => {
    const { container: gueltig } = render(
      <VerbrauchZeitraumFilter
        vonDatum="2026-07-01"
        bisDatum="2026-07-14"
        aufloesung="tag"
        inklusiveUnterknoten={true}
        zeitraumUngueltig={false}
        onVonDatumChange={vi.fn()}
        onBisDatumChange={vi.fn()}
        onAufloesungChange={vi.fn()}
        onInklusiveUnterknotenChange={vi.fn()}
      />,
    );
    expect(await runAxe(gueltig)).toEqual([]);

    const { container: ungueltig } = render(
      <VerbrauchZeitraumFilter
        vonDatum="2026-07-14"
        bisDatum="2026-07-01"
        aufloesung="tag"
        inklusiveUnterknoten={true}
        zeitraumUngueltig={true}
        onVonDatumChange={vi.fn()}
        onBisDatumChange={vi.fn()}
        onAufloesungChange={vi.fn()}
        onInklusiveUnterknotenChange={vi.fn()}
      />,
    );
    expect(await runAxe(ungueltig)).toEqual([]);
  });
});
