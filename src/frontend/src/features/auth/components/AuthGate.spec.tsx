import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { AuthGate } from './AuthGate';

const { useAuthBootstrapMock } = vi.hoisted(() => ({ useAuthBootstrapMock: vi.fn() }));

vi.mock('../hooks/useAuthBootstrap', () => ({ useAuthBootstrap: useAuthBootstrapMock }));

describe('AuthGate', () => {
  afterEach(() => {
    useAuthBootstrapMock.mockReset();
  });

  it('zeigt einen Ladehinweis, solange der Login-Bootstrap läuft', () => {
    useAuthBootstrapMock.mockReturnValue({ isBootstrapping: true, isAuthenticated: false });

    render(
      <AuthGate>
        <p>Geschützter Inhalt</p>
      </AuthGate>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Anmeldestatus wird geprüft …');
    expect(screen.queryByText('Geschützter Inhalt')).not.toBeInTheDocument();
  });

  it('zeigt den Login-Screen, wenn der Bootstrap ohne Access-Token endet', () => {
    useAuthBootstrapMock.mockReturnValue({ isBootstrapping: false, isAuthenticated: false });

    render(
      <AuthGate>
        <p>Geschützter Inhalt</p>
      </AuthGate>,
    );

    expect(screen.getByRole('heading', { name: 'Anmeldung erforderlich' })).toBeInTheDocument();
    expect(screen.queryByText('Geschützter Inhalt')).not.toBeInTheDocument();
  });

  it('zeigt die Kinder, sobald authentifiziert (Session-/Logout-Anzeige besitzt AppShell, NICHT AuthGate — Doppel-Header-Fund)', () => {
    useAuthBootstrapMock.mockReturnValue({ isBootstrapping: false, isAuthenticated: true });

    render(
      <AuthGate>
        <p>Geschützter Inhalt</p>
      </AuthGate>,
    );

    expect(screen.getByText('Geschützter Inhalt')).toBeInTheDocument();
  });

  it('hat im Login-Screen-Zustand keine erkennbaren axe-Verstöße', async () => {
    useAuthBootstrapMock.mockReturnValue({ isBootstrapping: false, isAuthenticated: false });

    const { container } = render(
      <AuthGate>
        <p>Geschützter Inhalt</p>
      </AuthGate>,
    );

    expect(await runAxe(container)).toEqual([]);
  });
});
