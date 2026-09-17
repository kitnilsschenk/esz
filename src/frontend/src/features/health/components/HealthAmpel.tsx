import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useHealthStatusView, type HealthIndicatorTone } from '../hooks/useHealthStatusView';
import { cn } from '../../../shared/lib/cn';
import { t } from '../../../shared/i18n/t';

const FARBKLASSE_JE_TON: Readonly<Record<HealthIndicatorTone, string>> = {
  ok: 'bg-success',
  pending: 'bg-muted-foreground',
  error: 'bg-destructive',
};

function schlimmsterTon(liveness: HealthIndicatorTone, readiness: HealthIndicatorTone): HealthIndicatorTone {
  if (liveness === 'error' || readiness === 'error') {
    return 'error';
  }
  if (liveness === 'pending' || readiness === 'pending') {
    return 'pending';
  }
  return 'ok';
}

/**
 * Ampel-Punkt in der `AuthStatusHeader`-Leiste (Betriebs-UI-Konzept Punkt 1):
 * Health verschwindet NICHT von der Startseite, verliert nur seine
 * Startseiten-ROLLE — dieser kleine, farbige Punkt lässt das Betriebs-Team
 * Auffälligkeiten BEILÄUFIG sehen (Hover-Tooltip via natives `title`, Klick
 * öffnet `/verwaltung/systemstatus`), OHNE dass ein DB-Health-Check die
 * erste Zeile der App ist. Für JEDE authentifizierte Rolle sichtbar/klickbar
 * (der Nav-Eintrag selbst bleibt admin-only, s. `AppNav.tsx`) — es gibt hier
 * keine echte Sicherheitsgrenze (`/health`/`/health/ready` sind
 * unauthentifizierte Diagnose-Endpunkte).
 */
export function HealthAmpel(): ReactNode {
  const { liveness, readiness } = useHealthStatusView();
  const ton = schlimmsterTon(liveness.tone, readiness.tone);
  const hinweis = `${liveness.label}: ${liveness.message} · ${readiness.label}: ${readiness.message}`;

  return (
    <Link
      to="/verwaltung/systemstatus"
      title={hinweis}
      aria-label={`${t('health.ampel.ariaLabelPraefix')} ${hinweis}`}
      className="inline-flex items-center rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-full', FARBKLASSE_JE_TON[ton])} />
    </Link>
  );
}
