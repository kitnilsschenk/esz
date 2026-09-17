// Client-seitige Spiegelung von `einfluss.katalog`
// (`migrations/V0020__einfluss_einflussgroessen_schema.sql`, Backend-Pendant
// `src/backend/src/stammdaten/einflussgroesse/einflussgroesse.constants.ts`).
// Es gibt in v1 KEINEN GET-Endpunkt für den Katalog (bewusst: fünf statische,
// DB-governte Codes, ADR-0006 Teil B D-KATALOG-SEED) — die Werteliste ist
// daher hier dupliziert, exakt wie das Backend selbst es tut (dortiger
// Klassen-Kommentar: "JEDE Änderung hier MUSS synchron mit den DB-CHECKs
// bleiben"). Rein für UI-Komfort (Formular-Optionen/Einheiten/Hinweise) — die
// Autorität bleibt beim Server (`EinflussgroesseService.validiereWerte()`),
// der dieselben Regeln erneut prüft und bei Verstoß 400 liefert.

import type { EinflussAnlassCode, EinflussBetroffenerTyp, EinflussQuelleTyp, EinflussRechtsgrundlage } from '@edms/shared';

export type EinflussWertArt = 'numerisch' | 'codiert';

export interface EinflussKatalogEintrag {
  readonly code: string;
  readonly wertArt: EinflussWertArt;
  readonly einheit?: string;
}

/** `einfluss.katalog`-Seed (V0020) — Reihenfolge = Anzeigereihenfolge der `select`-Optionen. */
export const EINFLUSS_KATALOG: readonly EinflussKatalogEintrag[] = [
  { code: 'nutzungszweck', wertArt: 'codiert' },
  { code: 'energietraeger_mix', wertArt: 'codiert' },
  { code: 'personenanzahl', wertArt: 'numerisch', einheit: 'Personen' },
  { code: 'nutzflaeche', wertArt: 'numerisch', einheit: 'm2' },
  { code: 'geraeteabschaffung', wertArt: 'codiert' },
];

export const GROESSE_CODE_WERTE: readonly string[] = EINFLUSS_KATALOG.map((eintrag) => eintrag.code);

export function wertArtFuerGroesseCode(groesseCode: string): EinflussWertArt | undefined {
  return EINFLUSS_KATALOG.find((eintrag) => eintrag.code === groesseCode)?.wertArt;
}

export function einheitFuerGroesseCode(groesseCode: string): string | undefined {
  return EINFLUSS_KATALOG.find((eintrag) => eintrag.code === groesseCode)?.einheit;
}

/**
 * `ck_katalog_wert_art`/B12.5 — NUR für `groesseCode==='nutzungszweck'`
 * geschlossen; `energietraeger_mix`/`geraeteabschaffung` sind codiert, aber
 * OHNE geschlossene Werteliste in dieser Version (Backend-DTO prüft dort nur
 * `MinLength/MaxLength`, kein `@IsIn`) — deshalb bleibt `wertCode` für diese
 * beiden ein Freitextfeld (Formular-Hinweis statt `select`-Optionen).
 */
export const NUTZUNGSZWECK_CODE_WERTE = ['wohnen', 'buero', 'handel', 'produktion', 'lager', 'sonstige'] as const;

export const BETROFFENER_TYP_WERTE: readonly EinflussBetroffenerTyp[] = ['endkunde', 'anschlussnutzer'];
export const QUELLE_TYP_WERTE: readonly EinflussQuelleTyp[] = ['endkunde', 'anschlussnutzer', 'betriebsteam', 'vor_ort'];
export const RECHTSGRUNDLAGE_WERTE: readonly EinflussRechtsgrundlage[] = ['art6_1b', 'art6_1f'];
export const ANLASS_CODE_WERTE: readonly EinflussAnlassCode[] = [
  'ersterfassung',
  'turnusaktualisierung',
  'korrektur',
  'systemgrenzenaenderung',
  'meldung_aenderung',
  'sonstige',
];

/** Art. 14 DSGVO (V0020-CHECK, `EinflussgroesseService#validiereWerte`) — Pflichtfelder bei `betroffenerTyp='anschlussnutzer'`. */
export function istArt14Pflicht(betroffenerTyp: EinflussBetroffenerTyp | ''): boolean {
  return betroffenerTyp === 'anschlussnutzer';
}
