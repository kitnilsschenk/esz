import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { IngestStatusPanel } from './IngestStatusPanel';

const { useIngestStatusViewMock } = vi.hoisted(() => ({ useIngestStatusViewMock: vi.fn() }));

vi.mock('../../hooks/ingestBetrieb', () => ({ useIngestStatusView: useIngestStatusViewMock }));

const QUELLE = {
  quelleCode: 'netz-a',
  brokerHost: 'broker.example:8883',
  topic: 'application/+/device/+/event/up',
  clientId: 'edms-ingest-worker',
  lebendig: true,
  zustandLabel: 'verbunden',
  zustandBadgeVariante: 'success' as const,
  zustandHinweis: '',
  konfigurationHinweis: '',
  herzschlagLabel: '28.08.2026, 18:40',
  herzschlagRelativ: 'gerade eben',
};

const BASIS = {
  isPending: false,
  isError: false,
  quellen: [QUELLE],
  keineQuellen: false,
  kennzahlen: [
    { key: 'letzteSchreibungAt', label: 'Zuletzt geschrieben', wert: '28.08.2026, 16:32', relativ: 'vor 4 Std.' },
    { key: 'letzterMesswertAt', label: 'Jüngster Messzeitpunkt', wert: '28.08.2026, 16:30', relativ: 'vor 4 Std.' },
    { key: 'letzteQuarantaeneAt', label: 'Zuletzt aussortiert', wert: '28.08.2026, 15:00', relativ: 'vor 5 Std.' },
  ],
  quarantaeneGesamtLabel: '7',
  gruende: [
    { grund: 'devEUI_unbekannt', grundLabel: 'Gerät nicht zugeordnet', anzahlLabel: '5' },
    { grund: 'decode_fehler', grundLabel: 'Nutzdaten nicht auswertbar', anzahlLabel: '2' },
  ],
  nochNieDatenEmpfangen: false,
};

describe('IngestStatusPanel', () => {
  afterEach(() => {
    useIngestStatusViewMock.mockReset();
  });

  it('stellt den Schreibzeitpunkt absolut UND relativ dar', () => {
    // Die relative Angabe ist die betriebsrelevante: „vor 4 Std." bei einem
    // stündlich sendenden Gerät ist die Störungsmeldung.
    useIngestStatusViewMock.mockReturnValue(BASIS);

    render(
      <MemoryRouter>
        <IngestStatusPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText(/28\.08\.2026, 16:32/)).toBeInTheDocument();
    expect(screen.getAllByText(/vor 4 Std\./).length).toBeGreaterThan(0);
  });

  it('zeigt Broker und Topic — die Frage „hängen wir am richtigen Netzserver?"', () => {
    useIngestStatusViewMock.mockReturnValue(BASIS);

    render(
      <MemoryRouter>
        <IngestStatusPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText('broker.example:8883')).toBeInTheDocument();
    expect(screen.getByText('application/+/device/+/event/up')).toBeInTheDocument();
    expect(screen.getByText('netz-a')).toBeInTheDocument();
  });

  it('unterscheidet „Prozess tot" von „Broker nicht erreichbar" — zwei verschiedene Handgriffe', () => {
    useIngestStatusViewMock.mockReturnValue({
      ...BASIS,
      quellen: [
        {
          ...QUELLE,
          lebendig: false,
          zustandLabel: 'keine Verbindung',
          zustandBadgeVariante: 'destructive' as const,
          zustandHinweis: 'Der Aufnahme-Prozess meldet sich nicht mehr. Er ist vermutlich beendet oder abgestürzt.',
        },
      ],
    });

    render(
      <MemoryRouter>
        <IngestStatusPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText(/meldet sich nicht mehr/)).toBeInTheDocument();
  });

  it('weist mehrere Netzserver einzeln aus', () => {
    // Sonst verdeckte eine laufende Quelle den Ausfall einer anderen.
    useIngestStatusViewMock.mockReturnValue({
      ...BASIS,
      quellen: [QUELLE, { ...QUELLE, quelleCode: 'netz-b', lebendig: false, zustandLabel: 'keine Verbindung', zustandBadgeVariante: 'destructive' as const, zustandHinweis: 'Der Aufnahme-Prozess meldet sich nicht mehr.' }],
    });

    render(
      <MemoryRouter>
        <IngestStatusPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText('netz-a')).toBeInTheDocument();
    expect(screen.getByText('netz-b')).toBeInTheDocument();
    expect(screen.getAllByText('keine Verbindung')).toHaveLength(1);
  });

  it('sagt deutlich, wenn sich noch nie ein Aufnahme-Prozess gemeldet hat', () => {
    useIngestStatusViewMock.mockReturnValue({ ...BASIS, quellen: [], keineQuellen: true });

    render(
      <MemoryRouter>
        <IngestStatusPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Die Messdaten-Aufnahme läuft nicht/)).toBeInTheDocument();
  });

  it('sagt es deutlich, wenn noch nie ein Messwert geschrieben wurde', () => {
    useIngestStatusViewMock.mockReturnValue({ ...BASIS, nochNieDatenEmpfangen: true });

    render(
      <MemoryRouter>
        <IngestStatusPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText(/noch kein einziger Messwert geschrieben/)).toBeInTheDocument();
  });

  it('wertet eine leere Quarantäne als Entwarnung', () => {
    useIngestStatusViewMock.mockReturnValue({ ...BASIS, gruende: [], quarantaeneGesamtLabel: '0' });

    render(
      <MemoryRouter>
        <IngestStatusPanel />
      </MemoryRouter>,
    );

    expect(screen.getByText(/alle empfangenen Nachrichten wurden verarbeitet/)).toBeInTheDocument();
  });

  it('sagt, wenn der laufende Prozess eine andere Konfiguration faehrt als die gepflegte', () => {
    // Der Worker laedt seine Quelle NUR beim Start. Ohne diesen Hinweis
    // zeigte die Verwaltung die gepflegten Werte, waehrend der Prozess mit
    // anderen arbeitet — die Ansicht saegte also genau das Gegenteil dessen,
    // wofuer man sie aufruft.
    useIngestStatusViewMock.mockReturnValue({
      ...BASIS,
      quellen: [
        {
          ...QUELLE,
          konfigurationHinweis:
            'Der laufende Prozess arbeitet mit einer anderen Konfiguration als der gepflegten. Sie wirkt erst nach einem Neustart des Workers. Abweichend: brokerHost',
        },
      ],
    });

    render(<IngestStatusPanel />);

    expect(screen.getByText(/wirkt erst nach einem Neustart des Workers/)).toBeInTheDocument();
  });

  it('zeigt den Konfigurations-Hinweis NICHT, wenn alles zusammenpasst', () => {
    useIngestStatusViewMock.mockReturnValue(BASIS);

    render(<IngestStatusPanel />);

    expect(screen.queryByText(/Neustart des Workers/)).not.toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useIngestStatusViewMock.mockReturnValue(BASIS);

    const { container } = render(
      <MemoryRouter>
        <IngestStatusPanel />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
