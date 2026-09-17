import { useLiveness } from '../api/useLiveness';
import { useReadiness } from '../api/useReadiness';
import { t } from '../../../shared/i18n/t';

export type HealthIndicatorTone = 'pending' | 'ok' | 'error';

export interface HealthIndicatorView {
  readonly label: string;
  readonly message: string;
  readonly tone: HealthIndicatorTone;
}

export interface HealthStatusView {
  readonly liveness: HealthIndicatorView;
  readonly readiness: HealthIndicatorView;
  readonly isRefreshing: boolean;
  readonly refresh: () => void;
}

/**
 * Leitet aus den beiden Health-Server-State-Hooks (`useLiveness`,
 * `useReadiness`) ein reines Anzeige-Modell ab (Text/Ton je Status). Kapselt
 * die Ableitungslogik in einem Hook, damit die Status-Komponente keine
 * Business-Logik im JSX enthält (Frontend-Rule).
 */
export function useHealthStatusView(): HealthStatusView {
  const liveness = useLiveness();
  const readiness = useReadiness();

  const livenessView: HealthIndicatorView = liveness.isPending
    ? { label: t('health.liveness.label'), message: t('health.liveness.loading'), tone: 'pending' }
    : liveness.isError
      ? { label: t('health.liveness.label'), message: t('health.liveness.error'), tone: 'error' }
      : { label: t('health.liveness.label'), message: t('health.liveness.ok'), tone: 'ok' };

  const readinessView: HealthIndicatorView = readiness.isPending
    ? { label: t('health.readiness.label'), message: t('health.readiness.loading'), tone: 'pending' }
    : readiness.isError
      ? { label: t('health.readiness.label'), message: t('health.readiness.error'), tone: 'error' }
      : readiness.data.status === 'ok'
        ? { label: t('health.readiness.label'), message: t('health.readiness.ready'), tone: 'ok' }
        : { label: t('health.readiness.label'), message: t('health.readiness.notReady'), tone: 'error' };

  const isRefreshing = liveness.isFetching || readiness.isFetching;

  const refresh = (): void => {
    void liveness.refetch();
    void readiness.refetch();
  };

  return { liveness: livenessView, readiness: readinessView, isRefreshing, refresh };
}
