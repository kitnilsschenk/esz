import { useAccessTokenSnapshot } from './useAccessTokenSnapshot';
import { useSessionQuery } from '../api/useSessionQuery';

/**
 * Steuert die Sichtbarkeit des admin-only Nav-Eintrags „Systemstatus"
 * (`/verwaltung/systemstatus`, Betriebs-UI-Konzept Punkt 1/2). Dies ist KEINE
 * Autorisierungsentscheidung — die Route selbst bleibt für JEDE
 * authentifizierte Rolle erreichbar (der Ampel-Punkt in `AuthStatusHeader`
 * verlinkt für ALLE Rollen dorthin, „Betriebs-Team sieht Auffälligkeiten
 * beiläufig"); `useIstAdmin` blendet NUR den dauerhaften Nav-Eintrag für
 * Nicht-Admins aus (rein kosmetisch, analog `useKannStammdatenAnlegen`).
 * `/health`/`/health/ready` sind ohnehin unauthentifizierte
 * Diagnose-Endpunkte — es gibt hier keine echte Sicherheitsgrenze zu
 * verschieben.
 */
export function useIstAdmin(): boolean {
  const { accessToken } = useAccessTokenSnapshot();
  const session = useSessionQuery(accessToken !== undefined);
  return session.data?.roles.includes('admin') ?? false;
}
