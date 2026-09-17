import { Suspense, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { t } from '../shared/i18n/t';

interface RouteBoundaryProps {
  readonly children: ReactNode;
}

function RoutePendingFallback(): ReactNode {
  return (
    <p role="status" aria-live="polite">
      {t('common.routeLoading')}
    </p>
  );
}

/**
 * Route-Level Error-Boundary + Suspense-Fallback in EINEM
 * (`.claude/rules/frontend-react.md`: „Error-Boundaries auf Route-Level",
 * „Suspense + lazy für Route-Split"). `key={pathname}` erzwingt bei JEDEM
 * Pfadwechsel — auch bei reinem Parameterwechsel, z. B. zwischen zwei
 * Endkunde-Detailseiten mit unterschiedlicher ID — einen frischen
 * `RouteErrorBoundary`-Mount: die Klassenkomponente hat keinen eingebauten
 * Reset-Mechanismus und würde sich sonst nach einem einmaligen Fehler dauerhaft
 * im Fehlerzustand halten, auch nach Navigation zu einer anderen Ressource.
 */
export function RouteBoundary({ children }: RouteBoundaryProps): ReactNode {
  const location = useLocation();

  return (
    <RouteErrorBoundary key={location.pathname}>
      <Suspense fallback={<RoutePendingFallback />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}
