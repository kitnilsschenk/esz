import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { EndkundenTabelle } from './EndkundenTabelle';

const { useEndkundenListeViewMock, useEndkundeLabelsViewMock } = vi.hoisted(() => ({
  useEndkundenListeViewMock: vi.fn(),
  useEndkundeLabelsViewMock: vi.fn(),
}));

vi.mock('../../hooks/endkunde', () => ({
  useEndkundenListeView: useEndkundenListeViewMock,
  useEndkundeLabelsView: useEndkundeLabelsViewMock,
}));

/** Default: keine Label-Aufloesung (Rolle ohne `read:endkunde_pii`) — Pseudonym-Darstellung. */
function ohneLabels(): void {
  useEndkundeLabelsViewMock.mockReturnValue({
    anzeigeName: (id: string) => id.slice(0, 8),
    isPending: false,
    zeigtKlartext: false,
  });
}

describe('EndkundenTabelle', () => {
  afterEach(() => {
    useEndkundenListeViewMock.mockReset();
    useEndkundeLabelsViewMock.mockReset();
  });

  it('zeigt den Verarbeitungsstatus als deutschen Text und KEINEN Einwilligungsstatus; das ListItem traegt weiterhin KEINEN Namen (Linie 2)', () => {
    // Praezisierung seit ADR-0008 D12: Die Tabelle KANN einen Namen zeigen —
    // aber nur ueber den separaten, auditierten Label-Aufruf. Das
    // `EndkundeListItem` bleibt schema-erzwungen PII-frei; ohne Label-
    // Aufloesung (hier: `ohneLabels`) steht in der Namensspalte das Pseudonym.
    ohneLabels();
    useEndkundenListeViewMock.mockReturnValue({
      items: [
        {
          id: '0198c3aa-aaaa-7000-8000-000000000001',
          verarbeitungsStatus: 'aktiv',
          consentStatus: 'fehlt',
          vonWissAuswertungAusgenommen: false,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <EndkundenTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('aktiv')).toBeInTheDocument();
    // Der frühere Einwilligungsstatus stammte aus `energy.endkunde.consent_status`
    // — einem Slot aus V0002, den V0044 abgelöst hat und den niemand mehr
    // pflegt. Er stand bei JEDEM Kunden auf „fehlt". Ein Feld, das immer
    // dasselbe sagt, informiert nicht, es täuscht: Die Einwilligung ist je
    // Zweck und Subjektart zu beurteilen, und für den Endkunden ist sie bei
    // der Messdatenverarbeitung gar nicht die Grundlage. Die belastbare
    // Auskunft steht im Abschnitt „Einwilligungen und Rechtsgrundlagen“.
    expect(screen.queryByText('fehlt')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mustermann/)).not.toBeInTheDocument();
  });

  it('zeigt die Leer-Meldung, wenn keine Endkunden vorhanden sind', () => {
    ohneLabels();
    useEndkundenListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <EndkundenTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('Noch kein Endkunde angelegt — legen Sie den ersten Endkunden an, um mit der Erfassung zu beginnen.')).toBeInTheDocument();
  });

  it('erlaubt eine überschriebene Zeilen-Aktion (z. B. „Auswählen" statt „Details anzeigen", `StandortUebersichtAnsicht`)', () => {
    ohneLabels();
    useEndkundenListeViewMock.mockReturnValue({
      items: [
        {
          id: '0198c3aa-aaaa-7000-8000-000000000001',
          verarbeitungsStatus: 'aktiv',
          consentStatus: 'fehlt',
          vonWissAuswertungAusgenommen: false,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <EndkundenTabelle renderRowAction={(item) => <button type="button">Auswählen {item.id}</button>} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /Auswählen/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Details anzeigen/ })).not.toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    ohneLabels();
    useEndkundenListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <EndkundenTabelle />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });

  it('zeigt den Klartextnamen, sobald die Label-Aufloesung ihn liefert (ADR-0008 D12)', () => {
    useEndkundeLabelsViewMock.mockReturnValue({
      anzeigeName: (id: string) => (id.startsWith('0198c3aa') ? 'Stadtwerke Musterstadt' : id.slice(0, 8)),
      isPending: false,
      zeigtKlartext: true,
    });
    useEndkundenListeViewMock.mockReturnValue({
      items: [
        {
          id: '0198c3aa-aaaa-7000-8000-000000000001',
          verarbeitungsStatus: 'aktiv',
          consentStatus: 'fehlt',
          vonWissAuswertungAusgenommen: false,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <EndkundenTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('Stadtwerke Musterstadt')).toBeInTheDocument();
    // Die Kennung bleibt als eigene Spalte stehen — sie ist der stabile
    // Bezug, den auch Audit-Log und BAFA-Export fuehren.
    expect(screen.getByText('0198c3aa')).toBeInTheDocument();
  });

  it('faellt ohne Berechtigung auf das Pseudonym zurueck — KEIN Fehlerzustand', () => {
    // Rollen ohne `read:endkunde_pii` (z. B. compliance-auditor) sehen die
    // Liste unveraendert; die Oberflaeche zeigt keinen Fehler und keinen
    // Hinweis auf die Existenz eines Namens.
    ohneLabels();
    useEndkundenListeViewMock.mockReturnValue({
      items: [
        {
          id: '0198c3aa-aaaa-7000-8000-000000000001',
          verarbeitungsStatus: 'aktiv',
          consentStatus: 'fehlt',
          vonWissAuswertungAusgenommen: false,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <EndkundenTabelle />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText('0198c3aa').length).toBeGreaterThanOrEqual(1);
  });

  it('zeigt den Zweckbindungs-Hinweis NUR bei tatsaechlicher Klartext-Anzeige (Auflage A8)', () => {
    // A8 verneint eine blockierende Zweck-Bestaetigung ausdruecklich — ein
    // Token bei jedem Seitenaufbau entwertete das echte break-glass-Gate.
    // Der statische Hinweis erscheint aber auch nicht auf Vorrat.
    const items = [
      {
        id: '0198c3aa-aaaa-7000-8000-000000000001',
        verarbeitungsStatus: 'aktiv' as const,
        consentStatus: 'fehlt' as const,
        vonWissAuswertungAusgenommen: false,
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ];
    const liste = { items, isPending: false, isError: false, hasNextPage: false, isFetchingNextPage: false, loadMore: vi.fn() };

    ohneLabels();
    useEndkundenListeViewMock.mockReturnValue(liste);
    const { unmount } = render(
      <MemoryRouter>
        <EndkundenTabelle />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/zweckgebunden/)).not.toBeInTheDocument();
    unmount();

    useEndkundeLabelsViewMock.mockReturnValue({
      anzeigeName: () => 'Stadtwerke Musterstadt',
      isPending: false,
      zeigtKlartext: true,
    });
    useEndkundenListeViewMock.mockReturnValue(liste);
    render(
      <MemoryRouter>
        <EndkundenTabelle />
      </MemoryRouter>,
    );
    expect(screen.getByText(/zweckgebunden/)).toBeInTheDocument();
  });

  it('filtert die geladenen Zeilen auf Name UND Kennung (ADR-0008 D12 §6, Weg 1)', () => {
    // Der Filter muss auch fuer Rollen ohne `read:endkunde_pii` etwas tun —
    // dort liefert `anzeigeName` die Kurz-Id, also greift der Kennungs-Zweig.
    useEndkundeLabelsViewMock.mockReturnValue({
      anzeigeName: (id: string) => (id.startsWith('0198c3aa') ? 'Stadtwerke Musterstadt' : id.slice(0, 8)),
      isPending: false,
      zeigtKlartext: true,
    });
    useEndkundenListeViewMock.mockReturnValue({
      items: [
        {
          id: '0198c3aa-aaaa-7000-8000-000000000001',
          verarbeitungsStatus: 'aktiv',
          consentStatus: 'fehlt',
          vonWissAuswertungAusgenommen: false,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: '0299d4bb-bbbb-7000-8000-000000000002',
          verarbeitungsStatus: 'aktiv',
          consentStatus: 'fehlt',
          vonWissAuswertungAusgenommen: false,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <EndkundenTabelle />
      </MemoryRouter>,
    );

    // (a) ueber den Klartextnamen
    fireEvent.change(screen.getByLabelText('Liste filtern'), { target: { value: 'stadtwerke' } });
    expect(screen.getByText('Stadtwerke Musterstadt')).toBeInTheDocument();
    expect(screen.queryByText('0299d4bb')).not.toBeInTheDocument();

    // (b) ueber die Kennung. `getAllByText`: Ohne aufgeloestes Label steht die
    // Kurz-Id in ZWEI Spalten — Name (Rueckfall) und Kennung. Das ist gewollt.
    fireEvent.change(screen.getByLabelText('Liste filtern'), { target: { value: '0299d4bb' } });
    expect(screen.getAllByText('0299d4bb').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Stadtwerke Musterstadt')).not.toBeInTheDocument();
  });

  it('benennt die Grenze des Filters — er sucht NICHT im Bestand', () => {
    // Die Klartextnamen liegen feldverschluesselt je Subjekt; ein serverseitiges
    // `LIKE` ist technisch unmoeglich. Ein Filter, der wie eine Suche aussaehe,
    // waere ein falsches Versprechen.
    ohneLabels();
    useEndkundenListeViewMock.mockReturnValue({
      items: [
        {
          id: '0198c3aa-aaaa-7000-8000-000000000001',
          verarbeitungsStatus: 'aktiv',
          consentStatus: 'fehlt',
          vonWissAuswertungAusgenommen: false,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      isPending: false,
      isError: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <EndkundenTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText(/sucht nicht im gesamten Bestand/)).toBeInTheDocument();
  });
});
