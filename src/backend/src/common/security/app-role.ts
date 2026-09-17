/**
 * Internes RBAC-Rollenvokabular (ADR-0002 Teil B §11/§14, A1 Abschnitt 8.1).
 *
 * Die drei v1-Grundrollen — DS-01-getrennt (`compliance-auditor` strikt
 * lesend, nie Personalunion mit `admin`). Realm-Rollen, die NICHT in dieser
 * Liste stehen, werden vom `RolesMapperService` verworfen, nicht durchgereicht.
 *
 * `geraete-support` (NEU, ADR-0005 §26.4 SEC-5) — eigene, eng geschnittene,
 * **rezertifizierungspflichtige** Rolle für die break-glass-gehärtete
 * Reverse-Auflösung `read:geraet_zuordnung` (Blind-Index/Zeile → Klartext-
 * DevEUI, `device-reverse-aufloesung.service.ts`). BEWUSST NICHT `betrieb`
 * (SEC-5 verlangt eine eigene, enge Rolle statt pauschalem Zugriff) — final
 * `security-lead`/`access-control-engineer` (s. `compliance/iso27001/soa.md`
 * A.5.18, A.8.3). **Keycloak-Hinweis (kein Code-/Deployment-Change in
 * diesem Paket):** die Realm-Rolle `geraete-support` muss noch in Keycloak
 * angelegt und den entsprechenden Support-Principals zugewiesen werden
 * (`deployment/keycloak/**`, außerhalb dieses Arbeitspakets — dort liegt
 * bereits eine andere, unabhängige, uncommitted Änderung; keine Kollision
 * durch dieses Paket). Bis zur Keycloak-Rollout ist die Rolle strukturell
 * VORHANDEN (`RolesMapperService`/`APP_ROLES`-Whitelist), aber NIEMANDEM
 * zugewiesen — der Reverse-Endpoint bleibt bis dahin für ALLE Prinzipale
 * `403 rolle_fehlt` (fail-closed, kein impliziter Zugriff).
 */
export const APP_ROLES = ['betrieb', 'compliance-auditor', 'admin', 'geraete-support'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as readonly string[]).includes(value);
}
