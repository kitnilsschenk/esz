/**
 * Audit-Event-Codes des Nutzerportals (V0067, [Q3] Kap. 6).
 *
 * WORTGLEICH mit den in `migrations/V0067__audit_portal_events.sql`
 * eingetragenen Codes und deren `erlaubte_kontext_keys`:
 *   - ZUGANG_AUSGEGEBEN: { synthetic, erneut, gueltig_bis }
 *   - ZUGANG_EINGELOEST: { synthetic }
 *   - ANMELDUNG:         { synthetic, grund }
 *   - ABMELDUNG:         { synthetic, grund }
 *
 * NIRGENDS enthalten: Endkunden-Kennung, Verbrauchswert, Zugangscode. Die
 * ersten beiden sind über `objekt_ref`/`actor_sub` auflösbar; der dritte darf
 * nirgends stehen — er existiert genau einmal, im Brief.
 */
export const PORTAL_EVENT_CODES = {
  ZUGANG_AUSGEGEBEN: 'portal.zugang.ausgegeben',
  ZUGANG_EINGELOEST: 'portal.zugang.eingeloest',
  ANMELDUNG: 'portal.anmeldung',
  ABMELDUNG: 'portal.abmeldung',
} as const;

/**
 * Gründe eines fehlgeschlagenen Anmeldeversuchs — bewusst grob.
 *
 * `unbekannt` deckt „Kennung existiert nicht" UND „Code existiert nicht" ab.
 * Die Unterscheidung gehört nicht einmal ins Log: Sie wäre eine Auskunft
 * darüber, welche Kennungen es gibt, und ein Angreifer mit Leserecht auf das
 * Log hätte damit die Vorarbeit erledigt.
 */
export const PORTAL_ANMELDUNG_GRUENDE = {
  UNBEKANNT: 'unbekannt',
  PASSWORT_FALSCH: 'passwort_falsch',
  GESPERRT: 'gesperrt',
  ABGELAUFEN: 'abgelaufen',
} as const;

export type PortalAnmeldungGrund = (typeof PORTAL_ANMELDUNG_GRUENDE)[keyof typeof PORTAL_ANMELDUNG_GRUENDE];
