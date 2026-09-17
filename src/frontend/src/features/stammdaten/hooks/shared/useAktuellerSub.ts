import { useAccessTokenSnapshot } from '../../../auth/hooks/useAccessTokenSnapshot';
import { useSessionQuery } from '../../../auth/api/useSessionQuery';

/**
 * Liefert den opaken Session-`sub` (`SessionInfo.sub`, personenbeziehbar=true;
 * pii=false; opaker Principal) der aktuellen Sitzung — `undefined`, solange
 * die Sitzung noch lädt oder fehlgeschlagen ist. Wird für die
 * Vier-Augen-UX beim Krypto-Shredding gebraucht (ADR-0009 §2.5): eine zweite
 * Person darf einen Shred-Antrag NICHT selbst freigeben/ablehnen
 * (`beantragtVonSub === aktueller sub`).
 *
 * Rein kosmetisch (analog `useKannStammdatenAnlegen`): der Server
 * (`ForbiddenException('vier_augen_selbstfreigabe_verboten')`,
 * `.claude/rules/backend-nestjs.md`) bleibt die alleinige
 * Durchsetzungsinstanz — dieser Hook steuert NUR, ob die
 * Freigeben-/Ablehnen-Aktionen für den eigenen Antrag vorsorglich
 * ausgeblendet werden (`useEndkundeShredAntragOffenView`).
 */
export function useAktuellerSub(): string | undefined {
  const { accessToken } = useAccessTokenSnapshot();
  const session = useSessionQuery(accessToken !== undefined);
  return session.data?.sub;
}
