import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('../features/portal', () => ({ PortalApp: () => <h1>Ihr Energieportal</h1> }));
vi.mock('../features/auth/components/AuthGate', () => ({
  AuthGate: ({ children }: { readonly children: React.ReactNode }) => <div>Betriebsanwendung{children}</div>,
}));
vi.mock('./AppShell', () => ({ AppShell: () => <span /> }));

afterEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, '', '/');
});

function rendereUnter(pfad: string): void {
  window.history.pushState({}, '', pfad);
  render(<App />);
}

describe('App — die Weiche zwischen Betriebs-UI und Nutzerportal', () => {
  it('startet unter `/` die Betriebsanwendung', () => {
    rendereUnter('/');

    expect(screen.getByText(/Betriebsanwendung/)).toBeInTheDocument();
  });

  it('startet unter `/portal` das Nutzerportal', () => {
    rendereUnter('/portal');

    expect(screen.getByRole('heading', { name: 'Ihr Energieportal' })).toBeInTheDocument();
  });

  it('laesst den Login-Bootstrap des Betriebs im Portal gar nicht erst laufen', () => {
    // Der Endkunde hat kein Keycloak-Konto. Liefe `AuthGate` auch fuer ihn,
    // saehe er beim Aufruf von `/portal` erst den Anmeldebildschirm des
    // Betriebs.
    rendereUnter('/portal/monate/018f1e2d-0000-7000-8000-0000000000e3');

    expect(screen.queryByText(/Betriebsanwendung/)).not.toBeInTheDocument();
  });

  it('verwechselt einen aehnlich beginnenden Betriebspfad nicht mit dem Portal', () => {
    rendereUnter('/portalverwaltung');

    expect(screen.getByText(/Betriebsanwendung/)).toBeInTheDocument();
  });
});
