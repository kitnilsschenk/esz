import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../../shared/testing/axe';
import { IngestQuellenTabelle } from './IngestQuellenTabelle';

const { useIngestQuellenViewMock, useQuelleStatusAktionMock } = vi.hoisted(() => ({
  useIngestQuellenViewMock: vi.fn(),
  useQuelleStatusAktionMock: vi.fn(),
}));

vi.mock('../../hooks/ingestQuelle', () => ({
  useIngestQuellenView: useIngestQuellenViewMock,
  useQuelleStatusAktion: useQuelleStatusAktionMock,
}));

const umschalten = vi.fn();

const AKTIVE_QUELLE = {
  id: '0198c3aa-aaaa-7000-8000-000000000001',
  quelleCode: 'netz-lahnstein',
  bezeichnung: 'ChirpStack Netz Lahnstein',
  brokerHost: 'mqtt.example.org:8883',
  topic: 'application/+/device/+/event/up',
  clientId: 'edms-ingest-worker',
  tlsLabel: 'TLS mit Client-Zertifikat',
  tlsBadgeVariante: 'success' as const,
  statusLabel: 'Aktiv',
  statusBadgeVariante: 'success' as const,
  istAktiv: true,
  geheimnisseLabel: 'Client-Zertifikat, Privater Schlüssel',
  notiz: '',
  geaendertLabel: '08.09.2026, 14:00',
  zertifikatLabel: 'Gültig bis 23.10.2026',
  zertifikatBadgeVariante: 'success' as const,
  zertifikatWarnt: false,
};

function mockView(overrides: Record<string, unknown> = {}): void {
  useIngestQuellenViewMock.mockReturnValue({
    items: [AKTIVE_QUELLE],
    isPending: false,
    isError: false,
    ladeFehlerMeldung: 'Die Datenquellen konnten nicht geladen werden.',
    istLeer: false,
    zeigeZertifikatHinweis: false,
    ...overrides,
  });
  useQuelleStatusAktionMock.mockReturnValue({
    umschalten,
    isSubmitting: false,
    submitErrorMessage: undefined,
    erfolgsMeldung: undefined,
  });
}

function rendere(): HTMLElement {
  const { container } = render(
    <MemoryRouter>
      <IngestQuellenTabelle />
    </MemoryRouter>,
  );
  return container;
}

afterEach(() => {
  vi.clearAllMocks();
  useIngestQuellenViewMock.mockReset();
  useQuelleStatusAktionMock.mockReset();
});

describe('IngestQuellenTabelle', () => {
  it('zeigt Broker, Topic und Verbindungsart je Quelle', () => {
    mockView();
    rendere();

    const tabelle = within(screen.getByRole('table'));
    expect(tabelle.getByText('ChirpStack Netz Lahnstein')).toBeInTheDocument();
    expect(tabelle.getByText('mqtt.example.org:8883')).toBeInTheDocument();
    expect(tabelle.getByText('TLS mit Client-Zertifikat')).toBeInTheDocument();
  });

  it('nennt die hinterlegten Geheimnisse beim NAMEN, nie ihren Wert', () => {
    // Die zentrale Zusage dieser Ansicht. Der Server gibt die Werte nicht
    // heraus, und hier soll auch keine Stelle entstehen, an der jemand danach
    // sucht — angezeigt wird, WELCHE Felder belegt sind.
    mockView();
    rendere();

    expect(screen.getByText('Client-Zertifikat, Privater Schlüssel')).toBeInTheDocument();
  });

  it('sagt ausdruecklich, wenn keine Zugangsdaten hinterlegt sind', () => {
    // Eine leere Zelle liesse offen, ob nichts hinterlegt oder nichts
    // anzuzeigen ist. Bei einem Broker, der eine Anmeldung verlangt, ist
    // genau das die Fehlerursache.
    mockView({
      items: [{ ...AKTIVE_QUELLE, geheimnisseLabel: 'Keine Zugangsdaten hinterlegt' }],
    });
    rendere();

    expect(screen.getByText('Keine Zugangsdaten hinterlegt')).toBeInTheDocument();
  });

  it('bietet Deaktivieren an einer aktiven Quelle und ruft die Aktion auf', () => {
    mockView();
    rendere();

    fireEvent.click(screen.getByRole('button', { name: 'Deaktivieren' }));

    expect(umschalten).toHaveBeenCalledWith(AKTIVE_QUELLE.id, true);
  });

  it('bietet an einer inaktiven Quelle das Aktivieren an', () => {
    mockView({
      items: [{ ...AKTIVE_QUELLE, istAktiv: false, statusLabel: 'Inaktiv', statusBadgeVariante: 'outline' }],
    });
    rendere();

    expect(screen.getByRole('button', { name: 'Aktivieren' })).toBeInTheDocument();
  });

  it('nennt im Leerzustand den naechsten Schritt statt nur die Abwesenheit', () => {
    mockView({ items: [], istLeer: true });
    rendere();

    expect(screen.getByText(/damit ein Ingest-Worker weiß, wo er zuhören soll/)).toBeInTheDocument();
  });

  it('warnt sichtbar, wenn ein Zertifikat abgelaufen ist', () => {
    // Ein abgelaufenes Client-Zertifikat legt die Datenaufnahme still, und
    // zwar lautlos: Der Broker verweigert die Verbindung, niemand erfaehrt
    // davon. Deshalb steht der Hinweis UEBER der Tabelle und nicht nur als
    // Abzeichen in einer Spalte, die man gezielt suchen muesste.
    mockView({
      items: [
        {
          ...AKTIVE_QUELLE,
          zertifikatLabel: 'Abgelaufen — keine Verbindung möglich',
          zertifikatBadgeVariante: 'destructive',
          zertifikatWarnt: true,
        },
      ],
      zeigeZertifikatHinweis: true,
    });
    rendere();

    expect(screen.getByText(/verweigert der Broker die Verbindung/)).toBeInTheDocument();
    expect(screen.getByText('Abgelaufen — keine Verbindung möglich')).toBeInTheDocument();
  });

  it('zeigt den Zertifikats-Hinweis NICHT, solange alle gueltig sind', () => {
    mockView();
    rendere();

    expect(screen.queryByText(/verweigert der Broker die Verbindung/)).not.toBeInTheDocument();
  });

  it('laesst die Zertifikats-Spalte leer, wenn keins hinterlegt ist', () => {
    // Wo es gar kein Zertifikat geben MUSS (unverschluesselt oder nur TLS),
    // waere ein „—" nur Rauschen.
    mockView({ items: [{ ...AKTIVE_QUELLE, zertifikatLabel: '', zertifikatWarnt: false }] });
    rendere();

    expect(screen.queryByText(/Gültig bis/)).not.toBeInTheDocument();
  });

  it('ist barrierefrei', async () => {
    mockView();

    expect(await runAxe(rendere())).toEqual([]);
  });
});
