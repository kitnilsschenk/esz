import type { ReactNode } from 'react';
import { t } from '../../../shared/i18n/t';
import { useAuthBootstrap } from '../hooks/useAuthBootstrap';
import { LoginScreen } from './LoginScreen';

interface AuthGateProps {
  readonly children: ReactNode;
}

/**
 * Rendert `children` nur nach erfolgreichem Login-Bootstrap (Access-Token im
 * Memory) — sonst den Login-Screen. Während des Bootstrap-Checks
 * (`POST /auth/refresh`) erscheint ein barrierefreier Ladehinweis statt
 * eines kurzen Login-Screen-Flashs (ADR-0002 Teil B §16).
 *
 * Rendert bewusst NICHT selbst `AuthStatusHeader` — das lag früher hier
 * UND zusätzlich in `AppShell` (Live-Run-Fund: „Angemeldet als Betrieb /
 * Abmelden" erschien zweimal). `AuthGate` ist reine Zugangskontrolle;
 * `AppShell` (die authentifizierte Layout-Schale) besitzt die Session-/
 * Logout-Anzeige als Teil ihrer Topbar (Phase 4c-Feinschliff).
 */
export function AuthGate({ children }: AuthGateProps): ReactNode {
  const { isBootstrapping, isAuthenticated } = useAuthBootstrap();

  if (isBootstrapping) {
    return (
      <p role="status" aria-live="polite">
        {t('auth.gate.checking')}
      </p>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}
