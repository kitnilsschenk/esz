import type { BetroffenerTyp, QuelleTyp, Rechtsgrundlage } from '../persistence/einfluss/einfluss-intervall.repository';

/**
 * ADR-0006 Teil B (B8/B10/B12.5, `migrations/V0020` DB-CHECKs) — geschlossene
 * Wertelisten, im Backend GESPIEGELT (`.claude/rules/backend-nestjs.md`:
 * "spiegle CHECKs im Code als 400 problem+json, NICHT nur auf den DB-Fehler
 * verlassen"). JEDE Änderung hier MUSS synchron mit den DB-CHECKs in
 * `migrations/V0020__einfluss_einflussgroessen_schema.sql` bleiben.
 */
export const BETROFFENER_TYP_WERTE: readonly BetroffenerTyp[] = ['endkunde', 'anschlussnutzer'];
export const QUELLE_TYP_WERTE: readonly QuelleTyp[] = ['endkunde', 'anschlussnutzer', 'betriebsteam', 'vor_ort'];
export const RECHTSGRUNDLAGE_WERTE: readonly Rechtsgrundlage[] = ['art6_1b', 'art6_1f'];

export const ANLASS_CODE_WERTE = [
  'ersterfassung',
  'turnusaktualisierung',
  'korrektur',
  'systemgrenzenaenderung',
  'meldung_aenderung',
  'sonstige',
] as const;
export type AnlassCode = (typeof ANLASS_CODE_WERTE)[number];

/** V0020 `ck_katalog_wert_art`: `groesse_code='nutzungszweck'` -> `wert_code` MUSS aus dieser Liste stammen (B12.5). */
export const NUTZUNGSZWECK_CODE_WERTE = ['wohnen', 'buero', 'handel', 'produktion', 'lager', 'sonstige'] as const;
export type NutzungszweckCode = (typeof NUTZUNGSZWECK_CODE_WERTE)[number];

/** `anlass_code`, das eine `korrigieren()`-Korrektur-Zeile IMMER server-seitig trägt — NIE client-wählbar (s. `EinflussgroesseService`). */
export const ANLASS_CODE_KORREKTUR: AnlassCode = 'korrektur';
