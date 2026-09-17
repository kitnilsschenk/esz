import { useAccessTokenSnapshot } from '../../../auth/hooks/useAccessTokenSnapshot';
import { useSessionQuery } from '../../../auth/api/useSessionQuery';

/**
 * `create:`/`read:`/`update:einflussgroesse` sind ALLE ausschließlich Rolle
 * `betrieb` — `compliance-auditor` ist strukturell ausgeschlossen (RBAC UND
 * eine eigenständige PDP-Regel, Defense-in-Depth,
 * `schemas/openapi/stammdaten.openapi.yaml`: "Klartext-PII-Leseaktion").
 * Analog `useKannStandortPiiLesen` — bewusst EIN EIGENER Hook statt
 * Wiederverwendung von `useKannStammdatenAnlegen`/`useKannStandortPiiLesen`
 * (könnten künftig auseinanderlaufen, s. dortiger Kommentar).
 *
 * Gated die GESAMTE Einflussgrößen-Sektion/die zugehörigen Routen für
 * Rollen ohne `betrieb` — sowohl das CTA-Paar auf der System-Detailseite
 * (`SystemDetailAnsicht`) als auch (stärker als bei den übrigen Entitäten,
 * s. Arbeitsauftrag: "Routen dürfen für Auditor NICHT sichtbar/erreichbar
 * sein") den Seiten-INHALT der drei Einflussgrößen-Seiten selbst
 * (`EinflussgroesseListePage`/`EinflussgroesseErfassenPage`/
 * `EinflussgroesseKorrigierenPage` zeigen ohne diese Berechtigung NUR einen
 * Zugriffsverweigert-Hinweis). Dies ist KEINE Autorisierungsentscheidung —
 * die alleinige Durchsetzungsinstanz bleibt der Server (`@Roles('betrieb')`
 * + PDP, `.claude/rules/backend-nestjs.md`).
 */
export function useKannEinflussgroesseLesen(): boolean {
  const { accessToken } = useAccessTokenSnapshot();
  const session = useSessionQuery(accessToken !== undefined);
  return session.data?.roles.includes('betrieb') ?? false;
}
