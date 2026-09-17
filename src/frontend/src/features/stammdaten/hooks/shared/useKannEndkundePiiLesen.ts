import { useAccessTokenSnapshot } from '../../../auth/hooks/useAccessTokenSnapshot';
import { useSessionQuery } from '../../../auth/api/useSessionQuery';

/**
 * `read:endkunde_pii` ist NICHT fuer `compliance-auditor` erreichbar
 * (ADR-0008 D12 Auflage A5: Rolle `betrieb` NUR, RBAC UND die eigenstaendige
 * PDP-Regel `endkunde_pii_auditor_verboten`, Defense-in-Depth).
 *
 * Diese Pruefung ist bewusst client-seitig UND rein optimistisch: Sie
 * entscheidet NUR, OB der Label-Batch-Aufruf ueberhaupt abgesetzt wird — das
 * vermeidet unnoetigen Verkehr und ein unnoetiges (ohnehin abgelehntes)
 * Audit-Ereignis. Die Durchsetzung bleibt AUSSCHLIESSLICH beim Server; ein
 * veralteter Client-Zustand fuehrt schlimmstenfalls zu einem abgefangenen
 * 403, NIE zu einer Rechteausweitung.
 *
 * Zufaellig identisch zur Rollen-Pruefung von `useKannStammdatenAnlegen` und
 * `useKannStandortPiiLesen` (alle drei pruefen `betrieb`) — bewusst NICHT
 * wiederverwendet, genau wie dort begruendet: Die Berechtigungen sind
 * fachlich unabhaengig (Schreiben vs. Standort-PII vs. Endkunden-PII) und
 * koennen auseinanderlaufen. Auflage A5 verlangt dafuer ausdruecklich einen
 * EIGENEN Hook.
 */
export function useKannEndkundePiiLesen(): boolean {
  const { accessToken } = useAccessTokenSnapshot();
  const session = useSessionQuery(accessToken !== undefined);
  return session.data?.roles.includes('betrieb') ?? false;
}
