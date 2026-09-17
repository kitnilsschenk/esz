import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { NutzerinfoBericht } from './NutzerinfoBericht';

const { viewMock } = vi.hoisted(() => ({ viewMock: vi.fn() }));

vi.mock('../hooks/useNutzerinfoBerichtView', () => ({ useNutzerinfoBerichtView: viewMock }));

const INFO_ID = '018f1e2d-0000-7000-8000-0000000000e3';

function mockView(overrides: Record<string, unknown> = {}): void {
  viewMock.mockReturnValue({
    isPending: false,
    isError: false,
    ladeFehlerMeldung: 'Ladefehler',
    zeitraumLabel: '01.08.2026 – 31.08.2026',
    energietraegerLabel: 'Strom',
    ergebnisLabel: '230,5 kWh eingespart',
    istMehrverbrauch: false,
    verbrauchLabel: '1.200,0 kWh',
    erwartungLabel: '1.430,5 kWh',
    guteLabel: 'Belastbar',
    guteHinweis: undefined,
    gruppen: [
      { id: 'g1', bezeichnung: 'Beleuchtung', verbrauchLabel: '300,0 kWh', anteilLabel: '25 %', anteilPct: 25 },
    ],
    nichtZugeordnetLabel: '900,0 kWh',
    gruppenLeerMeldung: undefined,
    vormonatLabel: undefined,
    zugestelltLabel: undefined,
    ...overrides,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

function rendere(): HTMLElement {
  const { container } = render(
    <>
      <h1>Endkunde</h1>
      <NutzerinfoBericht informationId={INFO_ID} />
    </>,
  );
  return container;
}

describe('NutzerinfoBericht', () => {
  it('zeigt Einsparung, Verbrauch und Erwartung', () => {
    mockView();

    rendere();

    expect(screen.getByText('230,5 kWh eingespart')).toBeInTheDocument();
    expect(screen.getByText('1.200,0 kWh')).toBeInTheDocument();
    expect(screen.getByText('1.430,5 kWh')).toBeInTheDocument();
  });

  it('schreibt einen Mehrverbrauch aus, statt ihn als Betrag zu zeigen', () => {
    // Das Merkblatt verlangt die Angabe von Einsparungen UND Mehrverbraeuchen.
    // Ein vorzeichenloser Betrag waere gegenueber dem Kunden eine
    // Beschoenigung.
    mockView({ ergebnisLabel: '180,0 kWh mehr verbraucht als erwartet', istMehrverbrauch: true });

    rendere();

    const ergebnis = screen.getByText('180,0 kWh mehr verbraucht als erwartet');
    expect(ergebnis).toBeInTheDocument();
    expect(ergebnis.className).toContain('text-destructive-text');
  });

  it('zeigt die Aufteilung nach Geraetegruppen (Kap. 6)', () => {
    mockView();

    rendere();

    expect(screen.getByText('Beleuchtung')).toBeInTheDocument();
    expect(screen.getByText('300,0 kWh · 25 %')).toBeInTheDocument();
    expect(screen.getByText('900,0 kWh')).toBeInTheDocument();
  });

  it('sagt bei fehlender Zuordnung, dass nichts zugeordnet ist — statt einer leeren Aufteilung', () => {
    mockView({ gruppen: [], gruppenLeerMeldung: 'Noch keine Gerätegruppe zugeordnet.' });

    rendere();

    expect(screen.getByText('Noch keine Gerätegruppe zugeordnet.')).toBeInTheDocument();
    expect(screen.queryByText('Übriger erfasster Verbrauch')).not.toBeInTheDocument();
  });

  it('zeigt bei belastbarer Datenlage KEINEN Guete-Hinweis', () => {
    // Ein Guete-Vermerk unter jeder belastbaren Zahl waere Rauschen, das man
    // nach dem dritten Bericht nicht mehr liest.
    mockView();

    rendere();

    expect(screen.queryByText(/Abdeckung/)).not.toBeInTheDocument();
  });

  it('nennt die Abdeckung, sobald die Datenlage die Aussage einschraenkt', () => {
    mockView({ guteHinweis: 'Für diesen Monat liegen nicht alle Messwerte vor. Abdeckung 72,0 %.' });

    rendere();

    expect(screen.getByText(/Abdeckung 72,0 %/)).toBeInTheDocument();
  });

  it('zeigt den Vormonat, wenn es einen gab', () => {
    mockView({ vormonatLabel: 'damals 180,0 kWh eingespart' });

    rendere();

    expect(screen.getByText('damals 180,0 kWh eingespart')).toBeInTheDocument();
  });

  it('meldet einen Ladefehler', () => {
    mockView({ isError: true });

    rendere();

    expect(screen.getByRole('alert')).toHaveTextContent('Ladefehler');
  });

  it('ist barrierefrei', async () => {
    mockView({ vormonatLabel: 'damals 180,0 kWh eingespart', zugestelltLabel: '02.09.2026' });

    expect(await runAxe(rendere())).toEqual([]);
  });
});
