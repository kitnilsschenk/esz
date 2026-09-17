import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { GeraeteerkennungAbschnitt } from './GeraeteerkennungAbschnitt';

const { viewMock } = vi.hoisted(() => ({ viewMock: vi.fn() }));

vi.mock('../hooks/useGeraeteerkennungView', () => ({ useGeraeteerkennungView: viewMock }));

const ENDKUNDE_ID = '018f1e2d-0000-7000-8000-0000000000f1';
const GRUPPE_ID = '018f1e2d-0000-7000-8000-0000000000f2';
const KANAL_ID = '018f1e2d-0000-7000-8000-0000000000f3';

const WIRKSAME_ZUORDNUNG = {
  schluessel: `${GRUPPE_ID}|${KANAL_ID}|2026-01-01`,
  geraetegruppeId: GRUPPE_ID,
  gruppeBezeichnung: 'Beleuchtung',
  messkanalId: KANAL_ID,
  methodeLabel: 'Direktmessung',
  genauigkeitLabel: 'Genauigkeit des Messgeräts',
  anteilLabel: '100 %',
  topologieLabel: 'Untermessung (im Gesamtverbrauch enthalten)',
  zeitraumLabel: 'seit 01.01.2026',
  wirksam: true,
  beendetGrund: null,
};

const QUOTE = {
  foerderjahrLabel: 'FJ-1 (Projektjahr 1)',
  quoteLabel: '25 %',
  sollLabel: '20 %',
  erreicht: true,
  zugeordnetLabel: '250 kWh',
  gesamtLabel: '1.000 kWh',
  gruppen: [{ id: GRUPPE_ID, bezeichnung: 'Beleuchtung', label: '250 kWh · 25 %' }],
  ohneTageswerteHinweis: undefined,
  entbehrlichHinweis: undefined,
};

const setzeNeueGruppe = vi.fn();
const legeGruppeAn = vi.fn();
const setzeBeendenGrund = vi.fn();
const beende = vi.fn();
const setzeFoerderjahrId = vi.fn();
const setzeEnergietraeger = vi.fn();

function mockView(overrides: Record<string, unknown> = {}): void {
  viewMock.mockReturnValue({
    gruppen: [{ id: GRUPPE_ID, bezeichnung: 'Beleuchtung', beschreibung: null }],
    zuordnungen: [WIRKSAME_ZUORDNUNG],
    isPending: false,
    isError: false,
    ladeFehlerMeldung: 'Ladefehler',
    gruppenLeerMeldung: 'Noch keine Gruppe angelegt.',
    zuordnungenLeerMeldung: 'Noch kein Messkanal zugeordnet.',
    neueGruppe: '',
    setzeNeueGruppe,
    legeGruppeAn,
    beendenGrund: '',
    setzeBeendenGrund,
    beende,
    foerderjahre: [{ id: 'fj-1', label: 'FJ-1 (Projektjahr 1)' }],
    foerderjahrId: 'fj-1',
    setzeFoerderjahrId,
    energietraeger: 'strom',
    setzeEnergietraeger,
    quote: QUOTE,
    quoteLaedt: false,
    isSubmitting: false,
    submitErrorMessage: undefined,
    erfolgsMeldung: undefined,
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
      <GeraeteerkennungAbschnitt endkundeId={ENDKUNDE_ID} headingId="geraeteerkennung-heading" />
    </>,
  );
  return container;
}

describe('GeraeteerkennungAbschnitt', () => {
  it('zeigt Gruppen, Zuordnungen und die Quote', () => {
    mockView();

    rendere();

    expect(screen.getAllByText('Beleuchtung').length).toBeGreaterThan(0);
    expect(screen.getByText('Direktmessung')).toBeInTheDocument();
    expect(screen.getByText('25 %')).toBeInTheDocument();
    expect(screen.getByText('Die geforderte Quote ist erreicht.')).toBeInTheDocument();
  });

  it('legt eine Gruppe erst an, wenn eine Bezeichnung eingegeben ist', () => {
    mockView({ neueGruppe: '' });
    rendere();

    expect(screen.getByRole('button', { name: 'Gruppe anlegen' })).toBeDisabled();
  });

  it('legt die Gruppe auf Klick an', () => {
    mockView({ neueGruppe: 'Lüftung' });
    rendere();

    fireEvent.click(screen.getByRole('button', { name: 'Gruppe anlegen' }));

    expect(legeGruppeAn).toHaveBeenCalledTimes(1);
  });

  it('sperrt das Beenden, solange kein Grund eingetragen ist', () => {
    // Das Beenden senkt die Nachweisquote — ohne Begruendung waere spaeter
    // nicht mehr erklaerbar, warum sie gesunken ist.
    mockView({ beendenGrund: '' });
    rendere();

    expect(screen.getByRole('button', { name: 'Zuordnung beenden' })).toBeDisabled();
  });

  it('beendet die Zuordnung mit Gruppe und Kanal', () => {
    mockView({ beendenGrund: 'Zähler umgeklemmt' });
    rendere();

    fireEvent.click(screen.getByRole('button', { name: 'Zuordnung beenden' }));

    expect(beende).toHaveBeenCalledWith(GRUPPE_ID, KANAL_ID);
  });

  it('zeigt ohne Tageswerte KEINE 0 Prozent, sondern den Grund', () => {
    // Eine 0 sieht aus wie ein Ergebnis und wird als eines gelesen.
    mockView({
      quote: {
        ...QUOTE,
        quoteLabel: undefined,
        erreicht: undefined,
        ohneTageswerteHinweis: 'Für diesen Zeitraum liegen keine Tageswerte vor.',
      },
    });

    rendere();

    expect(screen.getByText('Die Quote ist für diesen Zeitraum nicht bestimmbar.')).toBeInTheDocument();
    expect(screen.getByText('Für diesen Zeitraum liegen keine Tageswerte vor.')).toBeInTheDocument();
    expect(screen.queryByText('0 %')).not.toBeInTheDocument();
  });

  it('fordert erst die Wahl eines Förderjahres', () => {
    mockView({ foerderjahrId: '', quote: undefined });

    rendere();

    expect(
      screen.getByText('Wählen Sie ein Förderjahr — die geforderte Quote hängt am Projektjahr.'),
    ).toBeInTheDocument();
  });

  it('meldet einen Ladefehler', () => {
    mockView({ isError: true });

    rendere();

    expect(screen.getByRole('alert')).toHaveTextContent('Ladefehler');
  });

  it('ist barrierefrei', async () => {
    mockView();

    expect(await runAxe(rendere())).toEqual([]);
  });
});
