import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { AuthStatusHeader } from './AuthStatusHeader';
import type { AuthStatusView } from '../hooks/useAuthStatusView';

const { useAuthStatusViewMock } = vi.hoisted(() => ({ useAuthStatusViewMock: vi.fn() }));

vi.mock('../hooks/useAuthStatusView', () => ({ useAuthStatusView: useAuthStatusViewMock }));
// Eigene Testdatei wäre `HealthAmpel.spec.tsx` — hier als No-Op gemockt (ruft
// sonst eine echte TanStack-Query-Health-Abfrage ohne `QueryClientProvider`
// auf), dieser Test prüft ausschließlich den Auth-Status-Header selbst.
vi.mock('../../health/components/HealthAmpel', () => ({ HealthAmpel: () => null }));

function mockView(overrides: Partial<AuthStatusView> = {}): void {
  useAuthStatusViewMock.mockReturnValue({
    roleLabel: 'Betrieb',
    isSessionLoading: false,
    hasSessionError: false,
    isLoggingOut: false,
    logout: vi.fn(),
    ...overrides,
  } satisfies AuthStatusView);
}

describe('AuthStatusHeader', () => {
  afterEach(() => {
    useAuthStatusViewMock.mockReset();
  });

  it('zeigt "Angemeldet als Betrieb" und einen "Abmelden"-Button', () => {
    mockView();

    render(<AuthStatusHeader />);

    expect(screen.getByRole('status')).toHaveTextContent('Angemeldet als Betrieb');
    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeInTheDocument();
  });

  it('zeigt den Ladehinweis, solange die Sitzung noch geladen wird', () => {
    mockView({ isSessionLoading: true, roleLabel: undefined });

    render(<AuthStatusHeader />);

    expect(screen.getByRole('status')).toHaveTextContent('Sitzung wird geladen …');
  });

  it('zeigt den Fehlerhinweis, wenn die Sitzung nicht geladen werden konnte', () => {
    mockView({ hasSessionError: true, roleLabel: undefined });

    render(<AuthStatusHeader />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Sitzungsinformationen konnten nicht geladen werden.',
    );
  });

  it('ruft die Logout-Aktion auf, wenn der "Abmelden"-Button aktiviert wird', () => {
    const logout = vi.fn();
    mockView({ logout });

    render(<AuthStatusHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('deaktiviert den Button und zeigt "Abmeldung läuft …", während die Logout-Mutation läuft', () => {
    mockView({ isLoggingOut: true });

    render(<AuthStatusHeader />);

    expect(screen.getByRole('button', { name: 'Abmeldung läuft …' })).toBeDisabled();
  });

  it('hat im Regelfall keine erkennbaren axe-Verstöße', async () => {
    mockView();

    const { container } = render(<AuthStatusHeader />);

    expect(await runAxe(container)).toEqual([]);
  });
});
