import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { IngestQuarantaeneTabelle } from './IngestQuarantaeneTabelle';

const { useIngestQuarantaeneListeViewMock, useIngestQuarantaeneFilterViewMock } = vi.hoisted(() => ({
  useIngestQuarantaeneListeViewMock: vi.fn(),
  useIngestQuarantaeneFilterViewMock: vi.fn(),
}));

vi.mock('../../hooks/ingestBetrieb', async () => {
  const echt = await vi.importActual<typeof import('../../hooks/ingestBetrieb/ingestBetriebFormat')>(
    '../../hooks/ingestBetrieb/ingestBetriebFormat',
  );
  return {
    quarantaeneGrundLabel: echt.quarantaeneGrundLabel,
    useIngestQuarantaeneListeView: useIngestQuarantaeneListeViewMock,
    useIngestQuarantaeneFilterView: useIngestQuarantaeneFilterViewMock,
  };
});

const UNBEKANNT = {
  id: '0198c3aa-aaaa-7000-8000-000000000001',
  grund: 'devEUI_unbekannt' as const,
  grundLabel: 'Gerät nicht zugeordnet',
  grundHinweis: 'Das Gerät sendet, ist aber keinem Zähler angebunden. Legen Sie den Zähler an und binden Sie das Gerät auf seiner Detailseite an.',
  zaehlerIdLabel: '—',
  zaehlerId: undefined,
  fPortLabel: '30',
  quelleLabel: 'netz-lahnstein',
  applicationLabel: '7b0c677e',
  topicRedacted: 'application/+/device/<redigiert>/event/up',
  empfangenAtLabel: '28.08.2026, 16:32',
  zaehlerMessgroessen: '',
};

const KANAL_FEHLT = {
  ...UNBEKANNT,
  id: '0198c3bb-bbbb-7000-8000-000000000002',
  grund: 'kanal_unbekannt' as const,
  grundLabel: 'Kein passender Messkanal',
  grundHinweis:
    'Der Wert kam an, aber am Zähler gibt es keinen Kanal für die gemeldete Messgröße. Die Schreibweise muss exakt übereinstimmen — vergleichen Sie zuerst mit den unten aufgeführten Messgrößen des Zählers, bevor Sie einen neuen Kanal anlegen.',
  zaehlerIdLabel: '0198c3cc',
  zaehlerId: '0198c3cc-cccc-7000-8000-000000000003',
  zaehlerMessgroessen: 'wirkarbeit (kWh)',
};

function mockListe(items: readonly unknown[]): void {
  useIngestQuarantaeneListeViewMock.mockReturnValue({
    items,
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    loadMore: vi.fn(),
  });
}

function mockFilter(overrides: Record<string, unknown> = {}) {
  const view = { grund: '', setzeGrund: vi.fn(), aktiverGrund: undefined, ...overrides };
  useIngestQuarantaeneFilterViewMock.mockReturnValue(view);
  return view;
}

describe('IngestQuarantaeneTabelle', () => {
  afterEach(() => {
    useIngestQuarantaeneListeViewMock.mockReset();
    useIngestQuarantaeneFilterViewMock.mockReset();
  });

  it('nennt bei fehlendem Kanal die Messgroessen, die der Zaehler tatsaechlich fuehrt', () => {
    // Der Kanal-Lookup der Aufnahme vergleicht die Messgroesse EXAKT. Weicht
    // die Schreibweise am Zaehler von der ab, die das Geraet meldet, findet
    // kein Uplink seinen Kanal — beobachtet 2026-09-08, als der Demo-Bestand
    // 'Wirkarbeit' fuehrte und der Decoder 'wirkarbeit' lieferte: Der gesamte
    // Ingest-Pfad war tot, und die Ursache liess sich nur finden, indem man
    // die Nutzlast von Hand dekodierte und gegen die Stammdaten hielt.
    //
    // Ohne diese Angabe fuehrt der Hinweis sogar in die Irre: Wer „legen Sie
    // den fehlenden Kanal an" liest, legt einen zweiten an, der dasselbe misst.
    mockFilter();
    mockListe([KANAL_FEHLT]);

    render(
      <MemoryRouter>
        <IngestQuarantaeneTabelle />
      </MemoryRouter>,
    );

    const tabelle = within(screen.getByRole('table'));
    expect(tabelle.getByText('wirkarbeit (kWh)')).toBeInTheDocument();
    expect(tabelle.getByText(/Schreibweise muss exakt uebereinstimmen|Schreibweise muss exakt übereinstimmen/)).toBeInTheDocument();
  });

  it('zeigt die Messgroessen-Liste NICHT bei Gruenden, an denen sie nichts erklaert', () => {
    // Bei einem unbekannten Geraet gibt es keinen Zaehler — die Liste waere
    // leer, und eine leere Zusatzzeile stellt die Tabelle nur zu.
    mockFilter();
    mockListe([UNBEKANNT]);

    render(
      <MemoryRouter>
        <IngestQuarantaeneTabelle />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Am Zähler geführt/)).not.toBeInTheDocument();
  });

  it('nennt zu jedem Grund den nächsten Handgriff, nicht nur den Code', () => {
    // Das ist der Unterschied zwischen einem Protokoll und einem
    // Arbeitsvorrat.
    mockFilter();
    mockListe([UNBEKANNT]);

    render(
      <MemoryRouter>
        <IngestQuarantaeneTabelle />
      </MemoryRouter>,
    );

    // Der Filter oben führt dieselben Bezeichnungen — deshalb gezielt in der
    // Tabelle suchen.
    const tabelle = within(screen.getByRole('table'));
    expect(tabelle.getByText('Gerät nicht zugeordnet')).toBeInTheDocument();
    expect(tabelle.getByText(/binden Sie das Gerät auf seiner Detailseite an/)).toBeInTheDocument();
    expect(screen.queryByText('devEUI_unbekannt')).not.toBeInTheDocument();
  });

  it('verlinkt den Zähler, wo er aufgelöst werden konnte', () => {
    mockFilter();
    mockListe([KANAL_FEHLT]);

    render(
      <MemoryRouter>
        <IngestQuarantaeneTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Zähler öffnen 0198c3cc/ })).toHaveAttribute(
      'href',
      '/stammdaten/zaehler/0198c3cc-cccc-7000-8000-000000000003',
    );
  });

  it('verlinkt nichts, wenn das Gerät gar keinem Zähler zuzuordnen war', () => {
    mockFilter();
    mockListe([UNBEKANNT]);

    render(
      <MemoryRouter>
        <IngestQuarantaeneTabelle />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: /Zähler öffnen/ })).not.toBeInTheDocument();
  });

  it('nennt Netzserver und Application — bei mehreren Netzen der erste Handgriff', () => {
    // Ohne sie trägt eine „Gerät nicht zugeordnet"-Zeile nur einen
    // redigierten Topic-String, mit dem niemand ein Gerät findet.
    mockFilter();
    mockListe([UNBEKANNT]);

    render(
      <MemoryRouter>
        <IngestQuarantaeneTabelle />
      </MemoryRouter>,
    );

    const tabelle = within(screen.getByRole('table'));
    expect(tabelle.getByText('netz-lahnstein')).toBeInTheDocument();
    expect(tabelle.getByText('7b0c677e')).toBeInTheDocument();
  });

  it('gibt weder Gerätekennung noch Rohpayload aus', () => {
    mockFilter();
    mockListe([UNBEKANNT, KANAL_FEHLT]);

    const { container } = render(
      <MemoryRouter>
        <IngestQuarantaeneTabelle />
      </MemoryRouter>,
    );

    expect(container.textContent).toContain('<redigiert>');
    expect(container.textContent?.toLowerCase()).not.toContain('deveui');
  });

  it('reicht den Grund-Filter durch', () => {
    const filter = mockFilter();
    mockListe([]);

    render(
      <MemoryRouter>
        <IngestQuarantaeneTabelle />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Grund'), { target: { value: 'decode_fehler' } });
    expect(filter.setzeGrund).toHaveBeenCalledWith('decode_fehler');
  });

  it('unterscheidet „nichts liegengeblieben" von „zu diesem Grund nichts"', () => {
    mockFilter();
    mockListe([]);
    const { unmount } = render(
      <MemoryRouter>
        <IngestQuarantaeneTabelle />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Sobald eine Nachricht nicht verarbeitet werden kann/)).toBeInTheDocument();
    unmount();

    mockFilter({ grund: 'decode_fehler', aktiverGrund: 'decode_fehler' });
    mockListe([]);
    render(
      <MemoryRouter>
        <IngestQuarantaeneTabelle />
      </MemoryRouter>,
    );
    expect(screen.getByText('Zu diesem Grund liegt nichts vor.')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    mockFilter();
    mockListe([UNBEKANNT, KANAL_FEHLT]);

    const { container } = render(
      <MemoryRouter>
        <IngestQuarantaeneTabelle />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
