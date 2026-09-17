import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VerbrauchView } from '../../hooks/verbrauch';
import { runAxe } from '../../../../shared/testing/axe';
import { VerbrauchAnsicht } from './VerbrauchAnsicht';

const { useVerbrauchViewMock } = vi.hoisted(() => ({ useVerbrauchViewMock: vi.fn() }));

vi.mock('../../hooks/verbrauch', async () => {
  const tatsaechlich = await vi.importActual<typeof import('../../hooks/verbrauch')>('../../hooks/verbrauch');
  return { ...tatsaechlich, useVerbrauchView: useVerbrauchViewMock };
});

const BASIS_VIEW: VerbrauchView = {
  isPending: false,
  isError: false,
  zeitraumUngueltig: false,
  istLeer: false,
  buckets: ['2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z'],
  gruppen: [
    {
      einheit: 'kWh',
      serien: [{ key: 'wirkarbeit', messgroesse: 'wirkarbeit', werte: [10, 12] }],
    },
  ],
  tabelle: [
    { zeitpunkt: '2026-07-01T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: 10 },
    { zeitpunkt: '2026-07-02T00:00:00.000Z', messgroesse: 'wirkarbeit', einheit: 'kWh', wert: 12 },
  ],
  metadaten: { einbezogeneZaehler: 2, einbezogeneKanaele: 3, ausgelasseneUntermessungen: 0, erkannteLuecken: 0 },
  aufloesung: 'tag',
  vonDatum: '2026-07-01',
  bisDatum: '2026-07-02',
  inklusiveUnterknoten: true,
  setVonDatum: vi.fn(),
  setBisDatum: vi.fn(),
  setAufloesung: vi.fn(),
  setInklusiveUnterknoten: vi.fn(),
};

describe('VerbrauchAnsicht', () => {
  afterEach(() => {
    useVerbrauchViewMock.mockReset();
  });

  it('zeigt Metadaten (einbezogene Zähler/Kanäle, erkannte Lücken) für Vertrauen in die Zahl', () => {
    useVerbrauchViewMock.mockReturnValue(BASIS_VIEW);
    render(<VerbrauchAnsicht standortId="std-1" />);

    expect(screen.getByText('2')).toBeInTheDocument(); // einbezogeneZaehler
    expect(screen.getByText('3')).toBeInTheDocument(); // einbezogeneKanaele
    expect(screen.getByText('Keine Lücken im Zeitraum')).toBeInTheDocument();
  });

  it('weist ausgelassene Untermessungen aus, damit die Kanalzahl erklärbar bleibt', () => {
    // Ohne diesen Hinweis wirkt die Kanalzahl der Anzeige falsch: die
    // Stammdaten führen mehr aktive Kanäle, als hier gezählt werden.
    useVerbrauchViewMock.mockReturnValue({
      ...BASIS_VIEW,
      metadaten: { einbezogeneZaehler: 2, einbezogeneKanaele: 3, ausgelasseneUntermessungen: 2, erkannteLuecken: 0 },
    });
    render(<VerbrauchAnsicht standortId="std-1" />);

    expect(screen.getByText(/\+ 2 Untermessungen nicht mitgezählt/)).toBeInTheDocument();
  });

  it('zeigt die Anzahl erkannter Lücken sichtbar an, wenn welche vorhanden sind', () => {
    useVerbrauchViewMock.mockReturnValue({
      ...BASIS_VIEW,
      metadaten: { einbezogeneZaehler: 2, einbezogeneKanaele: 3, ausgelasseneUntermessungen: 0, erkannteLuecken: 22 },
    });
    render(<VerbrauchAnsicht standortId="std-1" />);

    expect(screen.getByText('22 Lücken im Zeitraum')).toBeInTheDocument();
  });

  it('zeigt einen sauberen Leerzustand OHNE Diagramm, wenn keine Messwerte im Zeitraum existieren', () => {
    useVerbrauchViewMock.mockReturnValue({ ...BASIS_VIEW, istLeer: true, gruppen: [], tabelle: [] });
    render(<VerbrauchAnsicht standortId="std-1" />);

    expect(screen.getByText('Im gewählten Zeitraum liegen keine Messwerte vor. Prüfen Sie den Zeitraum oder unter „Datenqualität & Störungen", ob Daten ausbleiben.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /kWh/ })).not.toBeInTheDocument();
  });

  it('zeigt eine Fehlermeldung bei `isError`', () => {
    useVerbrauchViewMock.mockReturnValue({ ...BASIS_VIEW, isError: true });
    render(<VerbrauchAnsicht standortId="std-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
  });

  it('wechselt zwischen Diagramm- und Tabellenansicht (Daten nie nur grafisch)', () => {
    useVerbrauchViewMock.mockReturnValue(BASIS_VIEW);
    render(<VerbrauchAnsicht standortId="std-1" />);

    // Diagramm ist Default.
    expect(screen.getByRole('figure')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tabelle' }));

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useVerbrauchViewMock.mockReturnValue(BASIS_VIEW);
    const { container } = render(<VerbrauchAnsicht standortId="std-1" />);

    expect(await runAxe(container)).toEqual([]);
  });
});
