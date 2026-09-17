import type { AuthRole } from '@edms/shared';
import { useSessionQuery } from '../api/useSessionQuery';
import { useLogoutMutation } from '../api/useLogoutMutation';
import { useAccessTokenSnapshot } from './useAccessTokenSnapshot';
import { t } from '../../../shared/i18n/t';

export interface AuthStatusView {
  readonly roleLabel: string | undefined;
  readonly isSessionLoading: boolean;
  readonly hasSessionError: boolean;
  readonly isLoggingOut: boolean;
  readonly logout: () => void;
}

function toRoleLabel(roles: readonly AuthRole[]): string {
  return roles.map((role) => t(`auth.roles.${role}`)).join(', ');
}

/**
 * Leitet aus der Session-Query (`GET /auth/session`, Server-State via
 * TanStack Query) und der Logout-Mutation ein reines Anzeige-Modell für
 * `AuthStatusHeader` ab — kapselt die Ableitungslogik, damit die Komponente
 * keine Business-Logik im JSX enthält (Frontend-Rule).
 */
export function useAuthStatusView(): AuthStatusView {
  const { accessToken } = useAccessTokenSnapshot();
  const session = useSessionQuery(accessToken !== undefined);
  const logoutMutation = useLogoutMutation();

  return {
    roleLabel: session.data ? toRoleLabel(session.data.roles) : undefined,
    isSessionLoading: session.isPending,
    hasSessionError: session.isError,
    isLoggingOut: logoutMutation.isPending,
    logout: () => {
      logoutMutation.mutate();
    },
  };
}
