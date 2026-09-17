import type { ReactNode } from 'react';
import { t } from '../../../shared/i18n/t';
import { Button } from '../../../shared/ui/button';
import { ThemeToggle } from '../../../shared/theme/ThemeToggle';
import { HealthAmpel } from '../../health/components/HealthAmpel';
import { useAuthStatusView } from '../hooks/useAuthStatusView';

function statusMessage(view: ReturnType<typeof useAuthStatusView>): string {
  if (view.isSessionLoading) {
    return t('auth.status.sessionLoading');
  }
  if (view.hasSessionError) {
    return t('auth.status.sessionError');
  }
  return `${t('auth.status.loggedInAsPrefix')} ${view.roleLabel ?? ''}`.trim();
}

/**
 * Auth-Status-Indikator (angemeldet als Rolle / abmelden) — ADR-0002 Teil B
 * §16. Reine Darstellung; die Ableitungslogik steckt in `useAuthStatusView`.
 * Wird von `AppShell` GENAU EINMAL als Topbar der authentifizierten Layout-
 * Schale gerendert (Phase 4c-Feinschliff — Live-Run-Fund „doppelter Header").
 *
 * Trägt zusätzlich den Dark-/Light-Mode-Umschalter (`ThemeToggle`,
 * Phase 4c-Feinschliff) UND den Health-„Ampel-Punkt" (`HealthAmpel`,
 * Betriebs-UI-Konzept Punkt 1) links in derselben Topbar — es gibt in der
 * Shell nur DIESE eine `<header>`-Landmark, ein zweiter `<header>` (z. B. in
 * `app/`) würde ein doppeltes Landmark erzeugen.
 */
export function AuthStatusHeader(): ReactNode {
  const view = useAuthStatusView();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6">
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <HealthAmpel />
      </div>
      <div className="flex items-center gap-4">
        <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {statusMessage(view)}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={view.logout} disabled={view.isLoggingOut}>
          {view.isLoggingOut ? t('auth.status.loggingOut') : t('auth.status.logoutAction')}
        </Button>
      </div>
    </header>
  );
}
