import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAxe } from '../../../shared/testing/axe';
import { LoginScreen } from './LoginScreen';

const { startLoginMock } = vi.hoisted(() => ({ startLoginMock: vi.fn() }));

vi.mock('../lib/startLogin', () => ({ startLogin: startLoginMock }));

describe('LoginScreen', () => {
  afterEach(() => {
    startLoginMock.mockReset();
  });

  it('zeigt Titel, Beschreibung und einen "Anmelden"-Button', () => {
    render(<LoginScreen />);

    expect(screen.getByRole('heading', { name: 'Anmeldung erforderlich' })).toBeInTheDocument();
    expect(screen.getByText('Bitte melden Sie sich an, um das EDMS zu nutzen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
  });

  it('startet den OIDC-Login (Browser-Navigation zu /auth/login), wenn der Button aktiviert wird', () => {
    render(<LoginScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(startLoginMock).toHaveBeenCalledTimes(1);
  });

  it('hat keine erkennbaren axe-Verstöße', async () => {
    const { container } = render(<LoginScreen />);

    expect(await runAxe(container)).toEqual([]);
  });
});
