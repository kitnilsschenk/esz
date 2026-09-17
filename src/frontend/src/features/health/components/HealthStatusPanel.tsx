import type { ReactNode } from 'react';
import { t } from '../../../shared/i18n/t';
import { useDocumentTitle } from '../../../shared/hooks/useDocumentTitle';
import { useHealthStatusView } from '../hooks/useHealthStatusView';
import type { HealthIndicatorView } from '../hooks/useHealthStatusView';

interface IndicatorProps {
  readonly view: HealthIndicatorView;
}

function Indicator({ view }: IndicatorProps): ReactNode {
  return (
    <div>
      <dt>{view.label}</dt>
      {/* role="status" ist auf <dd> nicht erlaubt (axe: aria-allowed-role,
          implizite Rolle "definition") — die Live-Region liegt daher auf
          einem neutralen <span> im Inneren. */}
      <dd data-tone={view.tone}>
        <span role="status" aria-live="polite">
          {view.message}
        </span>
      </dd>
    </div>
  );
}

/**
 * Zeigt Liveness- und Readiness-Status an (ADR-0001 §10.7 Walking Skeleton).
 * Reine Darstellung — die Ableitungslogik steckt in `useHealthStatusView`.
 */
export function HealthStatusPanel(): ReactNode {
  const { liveness, readiness, isRefreshing, refresh } = useHealthStatusView();
  useDocumentTitle(t('health.title'));

  return (
    <section aria-labelledby="health-status-heading">
      <h1 id="health-status-heading">{t('health.title')}</h1>
      <dl>
        <Indicator view={liveness} />
        <Indicator view={readiness} />
      </dl>
      <button type="button" onClick={refresh} disabled={isRefreshing}>
        {t('health.refresh')}
      </button>
    </section>
  );
}
