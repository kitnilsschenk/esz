import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BerechnungslaufDetailView } from '../../hooks/berechnung';
import { runAxe } from '../../../../shared/testing/axe';
import { BerechnungslaufDetailAnsicht } from './BerechnungslaufDetailAnsicht';

const { useBerechnungslaufDetailViewMock } = vi.hoisted(() => ({ useBerechnungslaufDetailViewMock: vi.fn() }));

// Nur `useBerechnungslaufDetailView` wird ersetzt — die restlichen Exporte
// (insb. `formatiereZahl`, das `BerechnungslaufMonatsBalkendiagramm` intern
// nutzt) bleiben die ECHTE Implementierung (analog `VerbrauchAnsicht.spec.tsx`).
vi.mock('../../hooks/berechnung', async () => {
  const tatsaechlich = await vi.importActual<typeof import('../../hooks/berechnung')>('../../hooks/berechnung');
  return { ...tatsaechlich, useBerechnungslaufDetailView: useBerechnungslaufDetailViewMock };
});

// Holt eigene Daten (TanStack-Mutation) — wie die uebrigen Aktions-
// Komponenten gestubbt; ihr Verhaltenstest liegt in
// `BerechnungslaufNeuBerechnenAktion.spec.tsx`.
vi.mock('./BerechnungslaufNeuBerechnenAktion', () => ({
  BerechnungslaufNeuBerechnenAktion: () => <p>Neu-rechnen-Aktion (Stub)</p>,
}));

const BASIS_VIEW: BerechnungslaufDetailView = {
  isPending: false,
  isError: false,
  fields: [
    { key: 'id', label: 'Lauf-ID', value: '0198c3aa' },
    { key: 'verfahren', label: 'Verfahren', value: 'ADR-0006-B12 (v1)' },
    { key: 'qualitaetsStufeMin', label: 'Datenqualität (Minimum)', value: 'belastbar' },
  ],
  monatsZeilen: [
    {
      monat: '2026-01-01',
      monatLabel: 'Januar 2026',
      referenzKwh: 120,
      referenzKwhLabel: '120 kWh',
      istKwh: 100,
      istKwhLabel: '100 kWh',
      einsparungKwhLabel: '+20 kWh',
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
      einsparungKwhLabel: '-5 kWh',
      istMehrverbrauch: true,
      abdeckungPctLabel: '100 %',
      qualitaetsStufe: 'eingeschraenkt',
      qualitaetsStufeLabel: 'eingeschränkt',
      qualitaetsStufeBadgeVariante: 'warning',
    },
  ],
  istErsetzt: false,
  bilanz: {
    referenzKwhLabel: '210 kWh',
    istKwhLabel: '195 kWh',
    einsparungKwhLabel: '+15 kWh',
    istMehrverbrauch: false,
  },
};

function renderMitRouter(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <BerechnungslaufDetailAnsicht endkundeId="endkunde-1" laufId="lauf-1" />
    </MemoryRouter>,
  );
}

describe('BerechnungslaufDetailAnsicht', () => {
  afterEach(() => {
    useBerechnungslaufDetailViewMock.mockReset();
  });

  it('zeigt die Kopf-Felder über die generische `DetailView`-`<dl>`', () => {
    useBerechnungslaufDetailViewMock.mockReturnValue(BASIS_VIEW);

    renderMitRouter();

    expect(screen.getByText('Lauf-ID')).toBeInTheDocument();
    expect(screen.getByText('0198c3aa')).toBeInTheDocument();
    expect(screen.getByText('ADR-0006-B12 (v1)')).toBeInTheDocument();
  });

  it('zeigt Monatswerte SOWOHL als Diagramm ALS AUCH als Tabelle (Tabelle ist die Textalternative)', () => {
    useBerechnungslaufDetailViewMock.mockReturnValue(BASIS_VIEW);

    renderMitRouter();

    expect(screen.getByRole('figure')).toBeInTheDocument();
    const tabelle = screen.getByRole('table');
    expect(tabelle).toBeInTheDocument();
    expect(screen.getAllByText('Januar 2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText('120 kWh').length).toBeGreaterThan(0);
  });

  it('zeigt KEIN Diagramm, wenn der Lauf keine Monatswerte hat (Leerzustand der Tabelle bleibt sichtbar)', () => {
    useBerechnungslaufDetailViewMock.mockReturnValue({ ...BASIS_VIEW, monatsZeilen: [] });

    renderMitRouter();

    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    expect(screen.getByText('Keine Monatswerte vorhanden.')).toBeInTheDocument();
  });

  it('zeigt eine Fehlermeldung bei `isError`', () => {
    useBerechnungslaufDetailViewMock.mockReturnValue({ ...BASIS_VIEW, isError: true, fields: [], monatsZeilen: [] });

    renderMitRouter();

    expect(screen.getByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useBerechnungslaufDetailViewMock.mockReturnValue(BASIS_VIEW);

    const { container } = renderMitRouter();

    expect(await runAxe(container)).toEqual([]);
  });
  it('nennt die Einsparung als Zahl — je Monat und für den ganzen Zeitraum', () => {
    // Bis hierher standen nur Referenz und Ist nebeneinander. Wer die
    // Einsparung wissen wollte — die Frage, wegen der man auf diese Seite
    // kommt —, musste zwölf Differenzen im Kopf bilden.
    useBerechnungslaufDetailViewMock.mockReturnValue(BASIS_VIEW);
    renderMitRouter();

    expect(screen.getByText('Ergebnis des Zeitraums')).toBeInTheDocument();
    expect(screen.getByText('+15 kWh')).toBeInTheDocument();
    expect(screen.getByText('+20 kWh')).toBeInTheDocument();
    // Vorzeichen statt Betrag: Mehrverbrauch darf nicht wie Einsparung aussehen.
    expect(screen.getByText('-5 kWh')).toBeInTheDocument();
  });
});
