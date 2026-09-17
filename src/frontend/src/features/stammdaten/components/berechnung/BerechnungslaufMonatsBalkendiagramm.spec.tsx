import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { BerechnungslaufMonatsBalkendiagramm } from './BerechnungslaufMonatsBalkendiagramm';
import type { BerechnungslaufMonatsZeileView } from '../../hooks/berechnung';

const ZEILEN: readonly BerechnungslaufMonatsZeileView[] = [
  {
    monat: '2026-01-01',
    monatLabel: 'Januar 2026',
    referenzKwh: 120,
    referenzKwhLabel: '120 kWh',
    istKwh: 100,
    istKwhLabel: '100 kWh',
    einsparungKwhLabel: '+0 kWh',
    istMehrverbrauch: false,
    abdeckungPctLabel: '92,5 %',
    qualitaetsStufe: 'belastbar',
    qualitaetsStufeLabel: 'belastbar',
    qualitaetsStufeBadgeVariante: 'success',
  },
  {
    monat: '2026-02-01',
    monatLabel: 'Februar 2026',
    referenzKwh: 90,
    referenzKwhLabel: '90 kWh',
    istKwh: 95,
    istKwhLabel: '95 kWh',
    einsparungKwhLabel: '+0 kWh',
    istMehrverbrauch: false,
    abdeckungPctLabel: '100 %',
    qualitaetsStufe: 'eingeschraenkt',
    qualitaetsStufeLabel: 'eingeschränkt',
    qualitaetsStufeBadgeVariante: 'warning',
  },
];

describe('BerechnungslaufMonatsBalkendiagramm', () => {
  it('rendert PRO Monat GENAU zwei Balken (Referenz + Ist)', () => {
    const { container } = render(<BerechnungslaufMonatsBalkendiagramm titel="Referenz vs. Ist je Monat" zeilen={ZEILEN} />);

    // 2 Monate × 2 Serien = 4 Trefferflächen (`role="img"`, fokussierbar) + 4 sichtbare Pfade.
    const balken = screen.getAllByRole('img');
    expect(balken).toHaveLength(4);
    expect(container.querySelectorAll('path')).toHaveLength(4);
  });

  it('zeigt einen Tooltip mit Monat/Wert/Serie bei Hover UND bei Tastatur-Fokus (dieselben Informationen)', () => {
    render(<BerechnungslaufMonatsBalkendiagramm titel="Referenz vs. Ist je Monat" zeilen={ZEILEN} />);

    const referenzBalkenJanuar = screen.getByRole('img', { name: 'Januar 2026: 120 kWh, Referenz (R_m)' });

    // "120 kWh" existiert vor dem Hover nicht als sichtbarer Text (nur im aria-label der Trefferfläche).
    expect(screen.queryByText('120 kWh')).not.toBeInTheDocument();

    fireEvent.pointerEnter(referenzBalkenJanuar);
    expect(screen.getByText('120 kWh')).toBeInTheDocument();

    fireEvent.pointerLeave(referenzBalkenJanuar);
    expect(screen.queryByText('120 kWh')).not.toBeInTheDocument();

    fireEvent.focus(referenzBalkenJanuar);
    expect(screen.getByText('120 kWh')).toBeInTheDocument();

    fireEvent.blur(referenzBalkenJanuar);
    expect(screen.queryByText('120 kWh')).not.toBeInTheDocument();
  });

  it('macht jeden Balken per Tastatur erreichbar (`tabIndex=0`)', () => {
    render(<BerechnungslaufMonatsBalkendiagramm titel="Referenz vs. Ist je Monat" zeilen={ZEILEN} />);

    for (const balken of screen.getAllByRole('img')) {
      expect(balken).toHaveAttribute('tabindex', '0');
    }
  });

  it('zeigt IMMER eine Legende MIT Text-Direktbeschriftung (fest 2 Serien, Farbe allein reicht nicht)', () => {
    render(<BerechnungslaufMonatsBalkendiagramm titel="Referenz vs. Ist je Monat" zeilen={ZEILEN} />);

    expect(screen.getByRole('list', { name: 'Legende der Diagrammserien' })).toBeInTheDocument();
    expect(screen.getAllByText('Referenz (R_m)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ist').length).toBeGreaterThan(0);
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(<BerechnungslaufMonatsBalkendiagramm titel="Referenz vs. Ist je Monat" zeilen={ZEILEN} />);

    expect(await runAxe(container)).toEqual([]);
  });
});
