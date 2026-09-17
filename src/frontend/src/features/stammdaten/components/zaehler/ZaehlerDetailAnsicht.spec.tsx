import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { ZaehlerDetailAnsicht } from './ZaehlerDetailAnsicht';

const { useZaehlerDetailViewMock } = vi.hoisted(() => ({
  useZaehlerDetailViewMock: vi.fn(),
}));

vi.mock('../../hooks/zaehler', () => ({ useZaehlerDetailView: useZaehlerDetailViewMock }));
// Eigene Testdateien: `ZaehlerAendernFormular.spec.tsx`,
// `ZaehlerStilllegenAktion.spec.tsx`, `MesskanaeleTabelle` (Messkanal-Slice),
// `ZaehlerStandortBlock.spec.tsx`, `ZaehlerFreshnessStatus.spec.tsx` — hier
// bewusst als No-Op gemockt, damit dieser Test ausschließlich das
// Detail-Rendering prüft (die beiden neuen Blöcke rufen sonst echte
// TanStack-Query-Hooks ohne `QueryClientProvider` auf).
vi.mock('./ZaehlerAendernFormular', () => ({ ZaehlerAendernFormular: () => null }));
vi.mock('./ZaehlerStilllegenAktion', () => ({ ZaehlerStilllegenAktion: () => null }));
vi.mock('./ZaehlerStandortBlock', () => ({ ZaehlerStandortBlock: () => null }));
vi.mock('./ZaehlerFreshnessStatus', () => ({ ZaehlerFreshnessStatus: () => null }));
vi.mock('../messkanal', () => ({ MesskanaeleTabelle: () => null }));
// Geräte-Anbindung: eigene Testdatei `GeraetAnbindungAbschnitt.spec.tsx`.
vi.mock('../geraetZuordnung', () => ({ GeraetAnbindungAbschnitt: () => null }));
// Gerätetyp-Kanalvorlage: eigene Testdatei `ErwarteteMesskanaeleHinweis.spec.tsx`.
vi.mock('./ErwarteteMesskanaeleHinweis', () => ({ ErwarteteMesskanaeleHinweis: () => null }));

const ZAEHLER_ID = '0198c3aa-aaaa-7000-8000-000000000001';

describe('ZaehlerDetailAnsicht', () => {
  afterEach(() => {
    useZaehlerDetailViewMock.mockReset();
  });

  it('zeigt die Nicht-PII-Kernfelder eines Zählers', () => {
    useZaehlerDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [
        { key: 'id', label: 'ID', value: '0198c3aa' },
        { key: 'energietraeger', label: 'Energieträger', value: 'Strom' },
        { key: 'status', label: 'Status', value: 'aktiv' },
      ],
      istStillgelegt: false,
      geraetAnbindung: null,
      geraetetyp: 'DeZem Harvey 2',
    });

    render(
      <MemoryRouter>
        <ZaehlerDetailAnsicht zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Strom')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Messkanal anlegen' })).toHaveAttribute(
      'href',
      `/stammdaten/zaehler/${ZAEHLER_ID}/messkanaele/neu`,
    );
  });

  it('zeigt die Fehlermeldung, wenn das Laden fehlschlägt', () => {
    useZaehlerDetailViewMock.mockReturnValue({ isPending: false, isError: true, fields: [], istStillgelegt: false, geraetAnbindung: null, geraetetyp: undefined });

    render(
      <MemoryRouter>
        <ZaehlerDetailAnsicht zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    useZaehlerDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      istStillgelegt: false,
      geraetAnbindung: null,
      geraetetyp: 'DeZem Harvey 2',
    });

    const { container } = render(
      <MemoryRouter>
        <ZaehlerDetailAnsicht zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(await runAxe(container)).toEqual([]);
  });

  it('sagt erfolgreiches Stilllegen über eine aria-live-Region an, sobald `istStillgelegt` von false auf true wechselt', () => {
    const baseView = {
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      istStillgelegt: false,
      geraetAnbindung: null,
      geraetetyp: 'DeZem Harvey 2',
    };
    useZaehlerDetailViewMock.mockReturnValue(baseView);

    const { rerender } = render(
      <MemoryRouter>
        <ZaehlerDetailAnsicht zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('');

    useZaehlerDetailViewMock.mockReturnValue({ ...baseView, istStillgelegt: true });
    rerender(
      <MemoryRouter>
        <ZaehlerDetailAnsicht zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Zähler wurde erfolgreich stillgelegt.');
  });

  it('sagt NICHT an, wenn ein bereits stillgelegter Zähler direkt geladen wird (keine false→true-Flanke)', () => {
    useZaehlerDetailViewMock.mockReturnValue({
      isPending: false,
      isError: false,
      fields: [{ key: 'id', label: 'ID', value: '0198c3aa' }],
      istStillgelegt: true,
      geraetAnbindung: null,
      geraetetyp: 'DeZem Harvey 2',
    });

    render(
      <MemoryRouter>
        <ZaehlerDetailAnsicht zaehlerId={ZAEHLER_ID} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
