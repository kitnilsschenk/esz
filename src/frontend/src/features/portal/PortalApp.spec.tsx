import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../shared/testing/axe';
import { PortalApp } from './PortalApp';

const { sitzungMock, abmeldungMock } = vi.hoisted(() => ({
  sitzungMock: vi.fn(),
  abmeldungMock: vi.fn(),
}));

vi.mock('./api', () => ({
  usePortalSitzung: sitzungMock,
  usePortalAbmeldung: abmeldungMock,
}));
vi.mock('./components/PortalUebersicht', () => ({
  PortalUebersicht: () => <h1>Ihre monatlichen Informationen</h1>,
}));
vi.mock('./components/PortalMonatSeite', () => ({ PortalMonatSeite: () => <h1>Ein Monat</h1> }));
vi.mock('./components/PortalAnmeldeSeite', () => ({ PortalAnmeldeSeite: () => <h1>Anmeldung</h1> }));

afterEach(() => {
  vi.clearAllMocks();
});

function rendere(sitzung: Record<string, unknown>, pfad = '/portal'): HTMLElement {
  sitzungMock.mockReturnValue({ isPending: false, data: undefined, ...sitzung });
  abmeldungMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  const { container } = render(
    <MemoryRouter initialEntries={[pfad]}>
      <PortalApp />
    </MemoryRouter>,
  );
  return container;
}

const ANGEMELDET = { data: { kennung: 'EK-A3K7QP', endkundeId: '018f1e2d-0000-7000-8000-0000000000a1' } };

describe('PortalApp', () => {
  it('zeigt ohne Sitzung die Anmeldemaske — nicht eine Weiterleitung', () => {
    rendere({});

    expect(screen.getByRole('heading', { name: 'Anmeldung' })).toBeInTheDocument();
  });

  it('zeigt mit Sitzung die eigenen Monate', () => {
    rendere(ANGEMELDET);

    expect(screen.getByRole('heading', { name: 'Ihre monatlichen Informationen' })).toBeInTheDocument();
  });

  it('zeigt beim ersten Laden weder das eine noch das andere', () => {
    // Sonst blitzte die Anmeldemaske auf, bevor die Sitzungsprobe zurueck ist.
    rendere({ isPending: true });

    expect(screen.queryByRole('heading', { name: 'Anmeldung' })).not.toBeInTheDocument();
    expect(screen.getByText('Wird geladen …')).toBeInTheDocument();
  });

  it('nennt die Kennung und bietet das Abmelden nur an, wenn eine Sitzung besteht', () => {
    rendere({});
    expect(screen.queryByRole('button', { name: 'Abmelden' })).not.toBeInTheDocument();
  });

  it('meldet ab', () => {
    const mutate = vi.fn();
    sitzungMock.mockReturnValue({ isPending: false, ...ANGEMELDET });
    abmeldungMock.mockReturnValue({ mutate, isPending: false });

    render(
      <MemoryRouter initialEntries={['/portal']}>
        <PortalApp />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('traegt KEINE Betriebs-Navigation', () => {
    // Der Endkunde soll die Betriebsanwendung nie zu sehen bekommen — auch
    // nicht als leere Navigationspunkte, die ihm nichts sagen.
    rendere(ANGEMELDET);

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText('Stammdaten')).not.toBeInTheDocument();
  });

  it('fuehrt einen unbekannten Portal-Pfad nicht in die Betriebs-UI', () => {
    rendere(ANGEMELDET, '/portal/gibtesnicht');

    expect(screen.getByRole('heading', { name: 'Diese Seite gibt es nicht' })).toBeInTheDocument();
  });

  it('ist barrierefrei', async () => {
    expect(await runAxe(rendere(ANGEMELDET))).toEqual([]);
  });
  it('nennt den Betreiber in der Fusszeile — sonst wuesste der Endkunde nicht, wessen Anwendung er benutzt', () => {
    // Das Portal ist die einzige kundengerichtete Oberflaeche. Sie war bis
    // 2026-09-16 vollstaendig markenlos.
    rendere({});

    expect(screen.getByText('KIT Consulting GmbH')).toBeInTheDocument();
    expect(screen.getByText('Kompetenzzentrum für Energie- und Gebäudeeffizienz')).toBeInTheDocument();
  });

  it('meldet das Signet nicht als eigenes Bild an den Screenreader', () => {
    rendere({});

    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

});
