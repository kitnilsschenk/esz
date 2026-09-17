import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { VerbrauchBalkendiagramm } from './VerbrauchBalkendiagramm';

const BUCKETS = ['2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z', '2026-07-03T00:00:00.000Z'];

describe('VerbrauchBalkendiagramm', () => {
  it('rendert je Serie GENAU einen Balken PRO vorhandenem (nicht-Lücken-)Wert', () => {
    const { container } = render(
      <VerbrauchBalkendiagramm
        titel="Wirkarbeit (kWh)"
        einheit="kWh"
        aufloesung="tag"
        buckets={BUCKETS}
        serien={[{ key: 'wirkarbeit', messgroesse: 'wirkarbeit', werte: [10, 12, 8] }]}
      />,
    );

    // 3 Werte -> 3 Trefferflächen (`role="img"`, fokussierbar) + 3 sichtbare Pfade.
    const balken = screen.getAllByRole('img', { name: /kWh/ });
    expect(balken).toHaveLength(3);
    expect(container.querySelectorAll('path')).toHaveLength(3);
  });

  it('zeichnet eine Lücke NICHT als Nullbalken — weder Trefferfläche noch Pfad entstehen dafür', () => {
    const { container } = render(
      <VerbrauchBalkendiagramm
        titel="Wirkarbeit (kWh)"
        einheit="kWh"
        aufloesung="tag"
        buckets={BUCKETS}
        serien={[{ key: 'wirkarbeit', messgroesse: 'wirkarbeit', werte: [10, undefined, 8] }]}
      />,
    );

    // NUR 2 Werte vorhanden -> NUR 2 Trefferflächen/Pfade, nicht 3.
    const balken = screen.getAllByRole('img', { name: /kWh/ });
    expect(balken).toHaveLength(2);
    expect(container.querySelectorAll('path')).toHaveLength(2);
    // Kein Balken behauptet einen Wert von 0 für den 02.07. (die Lücke).
    expect(screen.queryByRole('img', { name: /02\.07\.2026.*0 kWh/ })).not.toBeInTheDocument();
  });

  it('zeigt einen Tooltip mit Zeitpunkt/Wert/Einheit bei Hover UND bei Tastatur-Fokus (dieselben Informationen)', () => {
    render(
      <VerbrauchBalkendiagramm
        titel="Wirkarbeit (kWh)"
        einheit="kWh"
        aufloesung="tag"
        buckets={BUCKETS}
        serien={[{ key: 'wirkarbeit', messgroesse: 'wirkarbeit', werte: [10, 12, 8] }]}
      />,
    );

    const ersterBalken = screen.getAllByRole('img', { name: /01\.07\.2026/ })[0];
    expect(ersterBalken).toBeDefined();
    if (ersterBalken === undefined) {
      return;
    }

    // "01.07.2026" erscheint als x-Achsen-Beschriftung bereits VOR jedem Hover — der
    // Tooltip fügt einen ZWEITEN Treffer hinzu, der Wert "10 kWh" existiert vorher gar nicht.
    expect(screen.queryByText('10 kWh')).not.toBeInTheDocument();
    expect(screen.getAllByText('01.07.2026')).toHaveLength(1);

    fireEvent.pointerEnter(ersterBalken);
    expect(screen.getByText('10 kWh')).toBeInTheDocument();
    expect(screen.getAllByText('01.07.2026')).toHaveLength(2);

    fireEvent.pointerLeave(ersterBalken);
    expect(screen.queryByText('10 kWh')).not.toBeInTheDocument();

    fireEvent.focus(ersterBalken);
    expect(screen.getByText('10 kWh')).toBeInTheDocument();

    fireEvent.blur(ersterBalken);
    expect(screen.queryByText('10 kWh')).not.toBeInTheDocument();
  });

  it('macht jeden Balken per Tastatur erreichbar (`tabIndex=0`)', () => {
    render(
      <VerbrauchBalkendiagramm
        titel="Wirkarbeit (kWh)"
        einheit="kWh"
        aufloesung="tag"
        buckets={BUCKETS}
        serien={[{ key: 'wirkarbeit', messgroesse: 'wirkarbeit', werte: [10, 12, 8] }]}
      />,
    );

    for (const balken of screen.getAllByRole('img', { name: /kWh/ })) {
      expect(balken).toHaveAttribute('tabindex', '0');
    }
  });

  it('zeigt bei GENAU einer Serie KEINE Legendenbox (der Titel benennt sie bereits)', () => {
    render(
      <VerbrauchBalkendiagramm
        titel="Wirkarbeit (kWh)"
        einheit="kWh"
        aufloesung="tag"
        buckets={BUCKETS}
        serien={[{ key: 'wirkarbeit', messgroesse: 'wirkarbeit', werte: [10, 12, 8] }]}
      />,
    );

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('zeigt bei MEHREREN Serien eine Legende MIT Text-Direktbeschriftung (Farbe allein reicht nicht)', () => {
    render(
      <VerbrauchBalkendiagramm
        titel="Verbrauch (kWh)"
        einheit="kWh"
        aufloesung="tag"
        buckets={BUCKETS}
        serien={[
          { key: 'wirkarbeit', messgroesse: 'wirkarbeit', werte: [10, 12, 8] },
          { key: 'blindarbeit', messgroesse: 'blindarbeit', werte: [1, 2, 3] },
        ]}
      />,
    );

    expect(screen.getByRole('list', { name: 'Legende der Messgrößen' })).toBeInTheDocument();
    expect(screen.getAllByText('wirkarbeit').length).toBeGreaterThan(0);
    expect(screen.getAllByText('blindarbeit').length).toBeGreaterThan(0);
  });

  it('hat keine erkennbaren axe-Verstöße (Einzelserie)', async () => {
    const { container } = render(
      <VerbrauchBalkendiagramm
        titel="Wirkarbeit (kWh)"
        einheit="kWh"
        aufloesung="tag"
        buckets={BUCKETS}
        serien={[{ key: 'wirkarbeit', messgroesse: 'wirkarbeit', werte: [10, 12, 8] }]}
      />,
    );

    expect(await runAxe(container)).toEqual([]);
  });

  it('hat keine erkennbaren axe-Verstöße (mehrere Serien mit Legende)', async () => {
    const { container } = render(
      <VerbrauchBalkendiagramm
        titel="Verbrauch (kWh)"
        einheit="kWh"
        aufloesung="tag"
        buckets={BUCKETS}
        serien={[
          { key: 'wirkarbeit', messgroesse: 'wirkarbeit', werte: [10, 12, 8] },
          { key: 'blindarbeit', messgroesse: 'blindarbeit', werte: [1, 2, 3] },
        ]}
      />,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
