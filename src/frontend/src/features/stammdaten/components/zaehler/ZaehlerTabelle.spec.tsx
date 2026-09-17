import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { ZaehlerTabelle } from './ZaehlerTabelle';

const { useZaehlerListeViewMock } = vi.hoisted(() => ({
  useZaehlerListeViewMock: vi.fn(),
}));

vi.mock('../../hooks/zaehler', () => ({ useZaehlerListeView: useZaehlerListeViewMock }));

describe('ZaehlerTabelle', () => {
  afterEach(() => {
    useZaehlerListeViewMock.mockReset();
  });

  it('zeigt Energieträger und Status als deutschen Text', () => {
    useZaehlerListeViewMock.mockReturnValue({
      items: [
        {
          id: '0198c3aa-aaaa-7000-8000-000000000001',
          systemId: '0298c3bb-bbbb-7000-8000-000000000002',
          systemBezeichnung: 'Verwaltungsgebäude A1',
          energietraeger: 'strom',
          status: 'aktiv',
          createdAt: '2026-07-01T00:00:00.000Z',
          angebunden: true,
          letzteUebertragung: '2026-09-08T09:10:00.000Z',
          empfangLabel: 'Empfängt',
          empfangBadgeVariante: 'success',
          empfangZeitpunkt: '08.09.2026, 11:10',
          empfangRelativ: 'vor 4 Min.',
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
        <ZaehlerTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('Strom')).toBeInTheDocument();
    expect(screen.getByText('aktiv')).toBeInTheDocument();
  });

  it('sagt je Zeile, ob ein Geraet haengt und wann zuletzt etwas ankam', () => {
    // Die zwei Fragen, mit denen das Anschliessen einer Anlage anfaengt. Sie
    // standen bisher nur auf der Detailseite: Um den stummen Zaehler unter
    // zwoelfen zu finden, musste man zwoelfmal klicken.
    useZaehlerListeViewMock.mockReturnValue({
      items: [
        {
          id: '0198c3aa-aaaa-7000-8000-000000000001',
          systemId: '0298c3bb-bbbb-7000-8000-000000000002',
          systemBezeichnung: 'Verwaltungsgebäude A1',
          energietraeger: 'strom',
          status: 'aktiv',
          createdAt: '2026-07-01T00:00:00.000Z',
          angebunden: true,
          letzteUebertragung: '2026-09-08T09:10:00.000Z',
          empfangLabel: 'Empfängt',
          empfangBadgeVariante: 'success',
          empfangZeitpunkt: '08.09.2026, 11:10',
          empfangRelativ: 'vor 4 Min.',
        },
        {
          id: '0198c3aa-aaaa-7000-8000-000000000009',
          systemId: '0298c3bb-bbbb-7000-8000-000000000002',
          systemBezeichnung: 'Verwaltungsgebäude A1',
          energietraeger: 'gas',
          status: 'aktiv',
          createdAt: '2026-07-01T00:00:00.000Z',
          angebunden: false,
          letzteUebertragung: null,
          empfangLabel: 'Kein Gerät angebunden',
          empfangBadgeVariante: 'outline',
          empfangZeitpunkt: '',
          empfangRelativ: '',
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
        <ZaehlerTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('Empfängt')).toBeInTheDocument();
    expect(screen.getByText('vor 4 Min.')).toBeInTheDocument();
    expect(screen.getByText('Kein Gerät angebunden')).toBeInTheDocument();
  });

  it('zeigt keine Zeitangabe an einem Zaehler, an dem nie etwas ankam', () => {
    // Eine leere Zeitspalte ist ehrlicher als „—" an einer Stelle, an der es
    // gar keinen Zeitpunkt geben KANN: Ohne Geraet gibt es nichts zu erwarten.
    useZaehlerListeViewMock.mockReturnValue({
      items: [
        {
          id: '0198c3aa-aaaa-7000-8000-000000000009',
          systemId: '0298c3bb-bbbb-7000-8000-000000000002',
          systemBezeichnung: 'Verwaltungsgebäude A1',
          energietraeger: 'gas',
          status: 'aktiv',
          createdAt: '2026-07-01T00:00:00.000Z',
          angebunden: true,
          letzteUebertragung: null,
          empfangLabel: 'Angebunden, noch keine Daten',
          empfangBadgeVariante: 'warning',
          empfangZeitpunkt: '',
          empfangRelativ: '',
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
        <ZaehlerTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('Angebunden, noch keine Daten')).toBeInTheDocument();
    expect(screen.queryByText(/vor /)).not.toBeInTheDocument();
  });

  it('zeigt die Leer-Meldung, wenn keine Zähler vorhanden sind', () => {
    useZaehlerListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ZaehlerTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('Noch kein Zähler angelegt. Zähler werden immer einem System zugeordnet — legen Sie zuerst ein System an, falls noch keines besteht.')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useZaehlerListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    const { container } = render(
      <MemoryRouter>
        <ZaehlerTabelle />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });

  it('reicht im eingebetteten Modus den systemId-Filter an die Query durch', () => {
    useZaehlerListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ZaehlerTabelle systemId="0298c3bb-bbbb-7000-8000-000000000002" />
      </MemoryRouter>,
    );

    // Serverseitig filtern, NICHT clientseitig aus der Gesamtliste sieben —
    // sonst zeigte die eingebettete Liste nur, was zufällig auf Seite 1 lag.
    expect(useZaehlerListeViewMock).toHaveBeenCalledWith({ systemId: '0298c3bb-bbbb-7000-8000-000000000002' });
  });

  it('blendet die systemId-Spalte aus, wenn sie ohnehin in jeder Zeile gleich ist', () => {
    const item = {
      id: '0198c3aa-aaaa-7000-8000-000000000001',
      systemId: '0298c3bb-bbbb-7000-8000-000000000002',
      systemBezeichnung: 'Verwaltungsgebäude A1',
      energietraeger: 'strom' as const,
      status: 'aktiv' as const,
      createdAt: '2026-07-01T00:00:00.000Z',
      angebunden: false,
      letzteUebertragung: null,
      empfangLabel: 'Kein Gerät angebunden',
      empfangBadgeVariante: 'outline' as const,
      empfangZeitpunkt: '',
      empfangRelativ: '',
    };
    const view = { items: [item], isPending: false, isError: false, hasNextPage: false, isFetchingNextPage: false, loadMore: vi.fn() };

    useZaehlerListeViewMock.mockReturnValue(view);
    const { unmount } = render(
      <MemoryRouter>
        <ZaehlerTabelle />
      </MemoryRouter>,
    );
    expect(screen.getByText('0298c3bb')).toBeInTheDocument();
    unmount();

    useZaehlerListeViewMock.mockReturnValue(view);
    render(
      <MemoryRouter>
        <ZaehlerTabelle systemId={item.systemId} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('0298c3bb')).not.toBeInTheDocument();
  });

  it('nennt im eingebetteten Leerzustand den nächsten Schritt statt nur die Abwesenheit', () => {
    useZaehlerListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ZaehlerTabelle systemId="0298c3bb-bbbb-7000-8000-000000000002" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Diesem System ist noch kein Zähler zugeordnet/)).toBeInTheDocument();
  });
  it('zeigt den NAMEN des Systems, nicht nur seine Kennung', () => {
    // „System 77a6c17f" zwingt zum Nachschlagen. Die Kennung bleibt daneben
    // stehen — mit ihr sucht man in Protokollen.
    useZaehlerListeViewMock.mockReturnValue({
      items: [
        {
          id: '0198c3aa-aaaa-7000-8000-000000000001',
          systemId: '0298c3bb-bbbb-7000-8000-000000000002',
          systemBezeichnung: 'Verwaltungsgebäude A1',
          energietraeger: 'strom',
          status: 'aktiv',
          createdAt: '2026-07-01T00:00:00.000Z',
          angebunden: true,
          letzteUebertragung: '2026-09-08T09:10:00.000Z',
          empfangLabel: 'Empfängt',
          empfangBadgeVariante: 'success',
          empfangZeitpunkt: '08.09.2026, 11:10',
          empfangRelativ: 'vor 4 Min.',
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
        <ZaehlerTabelle />
      </MemoryRouter>,
    );

    expect(screen.getByText('Verwaltungsgebäude A1')).toBeInTheDocument();
  });
});
