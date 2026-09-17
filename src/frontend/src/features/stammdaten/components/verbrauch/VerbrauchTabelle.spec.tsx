import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { VerbrauchTabelle } from './VerbrauchTabelle';

describe('VerbrauchTabelle', () => {
  it('zeigt dieselben Werte wie das Diagramm — inkl. Zeitpunkt/Messgröße/Einheit/Wert je Zeile', () => {
    render(
      <VerbrauchTabelle
        caption="Verbrauch je Zeitraum"
        aufloesung="tag"
        zeilen={[
          { zeitpunkt: '2026-07-01T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: 10 },
          { zeitpunkt: '2026-07-02T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: 12 },
        ]}
      />,
    );

    expect(screen.getByText('01.07.2026')).toBeInTheDocument();
    expect(screen.getByText('02.07.2026')).toBeInTheDocument();
    expect(screen.getAllByText('wirkarbeit')).toHaveLength(2);
    expect(screen.getAllByText('kWh')).toHaveLength(2);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('zeigt eine Lücke (`wert: undefined`) als Text "Lücke", NIEMALS als "0"', () => {
    render(
      <VerbrauchTabelle
        caption="Verbrauch je Zeitraum"
        aufloesung="tag"
        zeilen={[{ zeitpunkt: '2026-07-01T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: undefined }]}
      />,
    );

    expect(screen.getByText('Lücke')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(
      <VerbrauchTabelle
        caption="Verbrauch je Zeitraum"
        aufloesung="tag"
        zeilen={[
          { zeitpunkt: '2026-07-01T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: 10 },
          { zeitpunkt: '2026-07-02T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: undefined },
        ]}
      />,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
