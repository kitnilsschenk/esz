/**
 * Referenz-Konstanten für die AuthN/AuthZ-Event-Typen aus ADR-0002 Teil B
 * §15. Katalog-Seed via `migrations/V0004__seed_auth_event_typen.sql`
 * (`/add-audit-event`, ADR-0003 §13.2: kontrolliertes Vokabular) — alle
 * fünf Codes sind dort in `audit.event_typ`/`audit.event_typ_version`
 * eingetragen (`objekt_typ`, `aktion_kategorie`, `erlaubte_kontext_keys`,
 * `rolle_erfassen`, `pflichtereignis` je Code, s. dortiger Migrations-Kopf).
 * `ZUGRIFF_VERWEIGERT` wird vom `AuditActionInterceptor`-Fallback emittiert
 * (`erlaubte_kontext_keys=['grund','route_muster']`, `rolle_erfassen=true`).
 */
export const AUTH_EVENT_CODES = {
  /** `ok`, nach vollständiger ID-Token-Validierung im Callback (rote Linie 1). */
  ANMELDUNG_ERFOLG: 'auth.anmeldung.erfolg',
  /** `denied`/`error` — `actor_sub=NULL`, `actor_typ='system'` (kein validierter Prinzipal). */
  ANMELDUNG_FEHLSCHLAG: 'auth.anmeldung.fehlschlag',
  /** `ok` — Refresh-Rotation (Datensparsamkeit weiterhin zu prüfen, ADR-0002 §15). */
  TOKEN_ERNEUERT: 'auth.token.erneuert',
  /** `ok`. */
  ABMELDUNG_ERFOLG: 'auth.abmeldung.erfolg',
  /** `denied` — AuthZ-Ablehnung (403) eines authentisierten Prinzipals (M2). */
  ZUGRIFF_VERWEIGERT: 'authz.zugriff.verweigert',
} as const;

export type AuthEventCode = (typeof AUTH_EVENT_CODES)[keyof typeof AUTH_EVENT_CODES];
