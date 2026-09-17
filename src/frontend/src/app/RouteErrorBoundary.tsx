import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../shared/i18n/t';

interface RouteErrorBoundaryProps {
  readonly children: ReactNode;
}

interface RouteErrorBoundaryState {
  readonly hasError: boolean;
}

/**
 * Error-Boundary auf App-/Route-Ebene (.claude/rules/frontend-react.md:
 * „Error-Boundaries auf Route-Level“). Fängt Rendering-Fehler ab und zeigt
 * einen generischen, barrierefreien Fehlertext statt eines weißen Bildschirms.
 * React-18-Error-Boundaries erfordern eine Klassenkomponente — es gibt keinen
 * Hook-Ersatz dafür.
 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  public override state: RouteErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Keine PII in Logs (Backend-Rule sinngemäß auch hier): nur Fehlertext
    // und Komponenten-Stack, keine Nutzereingaben/Antwortkörper.
    console.error('RouteErrorBoundary', error.message, errorInfo.componentStack);
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return <p role="alert">{t('common.errorGeneric')}</p>;
    }

    return this.props.children;
  }
}
