import { useAccessTokenSnapshot } from '../../../auth/hooks/useAccessTokenSnapshot';
import { useSessionQuery } from '../../../auth/api/useSessionQuery';

/**
 * `read:standort_pii` ist — anders als `read:standort` — NICHT für
 * `compliance-auditor` erreichbar (ADR-0010 D5: „Rolle `betrieb` NUR",
 * RBAC UND eine eigenständige PDP-Regel, Defense-in-Depth). Diese Prüfung
 * ist bewusst client-seitig UND rein optimistisch: sie entscheidet NUR, OB
 * die Baum-Ansicht den Label-Batch-Aufruf überhaupt absetzt (vermeidet
 * unnötigen Traffic UND ein unnötiges — wenn auch ohnehin abgelehntes —
 * Audit-Ereignis bei Rollen ohne diese Berechtigung). Die Durchsetzung
 * selbst bleibt AUSSCHLIESSLICH beim Server (`@Fachaktion('read:standort_pii')`
 * + PDP, `.claude/rules/backend-nestjs.md`) — ein veralteter/fehlerhafter
 * Client-Zustand führt im schlimmsten Fall zu einem abgefangenen 403 (s.
 * `useStandortBaumView.ts`), NIE zu einer tatsächlichen Rechteausweitung.
 *
 * Zufällig identisch zur Rollen-Prüfung von `useKannStammdatenAnlegen`
 * (beide prüfen `betrieb`) — bewusst NICHT wiederverwendet: die beiden
 * Berechtigungen sind fachlich unabhängig (Schreiben vs. PII-Lesen) und
 * könnten künftig auseinanderlaufen (z. B. eine weitere Rolle mit
 * Schreibrecht, aber ohne PII-Leserecht).
 */
export function useKannStandortPiiLesen(): boolean {
  const { accessToken } = useAccessTokenSnapshot();
  const session = useSessionQuery(accessToken !== undefined);
  return session.data?.roles.includes('betrieb') ?? false;
}
