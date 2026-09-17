import { useAccessTokenSnapshot } from '../../../auth/hooks/useAccessTokenSnapshot';
import { useSessionQuery } from '../../../auth/api/useSessionQuery';

/**
 * Optionale UX-Politur (ADR-0008 §23 / D11 Phase 4c Pass 2): blendet
 * „Anlegen"-Links für Rollen ohne `betrieb` aus (insb. `compliance-auditor`,
 * strikt lesend). Dies ist KEINE Autorisierungsentscheidung — die
 * `@Roles('betrieb')`-Guards der jeweiligen Backend-Controller lehnen
 * schreibende Aktionen ohnehin mit 403 ab (Server = alleinige
 * Durchsetzungsinstanz, `.claude/rules/backend-nestjs.md`). Liefert `false`,
 * solange die Sitzung noch lädt (konservativ: lieber kurz verstecken als
 * kurz anzeigen und wieder verstecken).
 *
 * Wird bewusst NUR in den in diesem Pass NEU gebauten Bausteinen verwendet
 * (Anschlussnutzer, Messkonzept) — die bereits fertigen Entitäts-Slices aus
 * Pass 1/Fundament bleiben unangetastet (Auftragsvorgabe).
 */
export function useKannStammdatenAnlegen(): boolean {
  const { accessToken } = useAccessTokenSnapshot();
  const session = useSessionQuery(accessToken !== undefined);
  return session.data?.roles.includes('betrieb') ?? false;
}
