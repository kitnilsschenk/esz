import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { MesskanaeleTabelle } from './MesskanaeleTabelle';

const { useMesskanaeleListeViewMock, MesskanalLastgangPanelMock } = vi.hoisted(() => ({
  useMesskanaeleListeViewMock: vi.fn(),
  // Der Parameter wird bewusst nicht ausgewertet (reiner No-Op-Stub) — die
  // `props && null`-Form hält ihn dennoch als „benutzt" (kein
  // `no-unused-vars`) UND fixiert die Arity auf 1, damit
  // `MesskanalLastgangPanelMock.mock.calls[0]?.[0]` unten typisiert bleibt.
  MesskanalLastgangPanelMock: vi.fn((props: { messkanalId: string; zaehlerId: string; onSchliessen: () => void }) => props && null),
}));

vi.mock('../../hooks/messkanal', () => ({ useMesskanaeleListeView: useMesskanaeleListeViewMock }));
// Eigene Testdatei `MesskanalLastgangPanel.spec.tsx` — hier als No-Op
// gemockt (ruft sonst eine echte TanStack-Mutation ohne QueryClientProvider
// auf), dieser Test prüft nur, DASS/WOMIT das Panel geöffnet wird.
vi.mock('../verbrauch', () => ({ MesskanalLastgangPanel: MesskanalLastgangPanelMock }));

const ZAEHLER_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('MesskanaeleTabelle', () => {
  afterEach(() => {
    useMesskanaeleListeViewMock.mockReset();
  });

  it('zeigt Messgröße, Einheit und Art als deutschen Text', () => {
    useMesskanaeleListeViewMock.mockReturnValue({
      items: [
        {
          id: '0298c3bb-bbbb-7000-8000-000000000002',
          zaehlerId: ZAEHLER_ID,
          messgroesse: 'wirkarbeit',
          einheit: 'kWh',
          art: 'kumulativ_zaehlerstand',
          status: 'aktiv',
          obisKennzahl: '1-0:1.8.0',
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
      freshnessIsPending: false,
      freshnessFuer: vi.fn().mockReturnValue(undefined),
    });

    render(
      <MemoryRouter>
        <MesskanaeleTabelle zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByText('wirkarbeit')).toBeInTheDocument();
    expect(screen.getByText('kumulativer Zählerstand')).toBeInTheDocument();
    expect(screen.getByText('1-0:1.8.0')).toBeInTheDocument();
  });

  it('zeigt die Leer-Meldung, wenn keine Messkanäle vorhanden sind', () => {
    useMesskanaeleListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
      freshnessIsPending: false,
      freshnessFuer: vi.fn().mockReturnValue(undefined),
    });

    render(
      <MemoryRouter>
        <MesskanaeleTabelle zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Für diesen Zähler ist noch kein Messkanal angelegt. Ohne Messkanal können keine Messwerte zugeordnet werden.')).toBeInTheDocument();
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useMesskanaeleListeViewMock.mockReturnValue({
      items: [],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
      freshnessIsPending: false,
      freshnessFuer: vi.fn().mockReturnValue(undefined),
    });

    const { container } = render(
      <MemoryRouter>
        <MesskanaeleTabelle zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });

  const MESSKANAL_ID = '0298c3bb-bbbb-7000-8000-000000000002';

  function mockEinKanal(freshness: ReturnType<typeof vi.fn>): void {
    useMesskanaeleListeViewMock.mockReturnValue({
      items: [
        {
          id: MESSKANAL_ID,
          zaehlerId: ZAEHLER_ID,
          messgroesse: 'wirkarbeit',
          einheit: 'kWh',
          art: 'kumulativ_zaehlerstand',
          status: 'aktiv',
          obisKennzahl: null,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: vi.fn(),
      freshnessIsPending: false,
      freshnessFuer: freshness,
    });
  }

  it('zeigt „Letzte Übertragung" als Badge, wenn die Freshness-Nebenabfrage einen Eintrag liefert', () => {
    mockEinKanal(vi.fn().mockReturnValue({ label: 'vor 3 Std.', ueberfaellig: false }));

    render(
      <MemoryRouter>
        <MesskanaeleTabelle zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByText('vor 3 Std.')).toBeInTheDocument();
  });

  it('öffnet das `MesskanalLastgangPanel` mit `messkanalId`/`zaehlerId`, sobald „Lastgang ansehen" geklickt wird', () => {
    mockEinKanal(vi.fn().mockReturnValue(undefined));
    MesskanalLastgangPanelMock.mockClear();

    render(
      <MemoryRouter>
        <MesskanaeleTabelle zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(MesskanalLastgangPanelMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: `Lastgang ansehen ${MESSKANAL_ID.slice(0, 8)}` }));

    expect(MesskanalLastgangPanelMock).toHaveBeenCalled();
    expect(MesskanalLastgangPanelMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ messkanalId: MESSKANAL_ID, zaehlerId: ZAEHLER_ID }),
    );
  });
});
