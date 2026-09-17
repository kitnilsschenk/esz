// Anzeige-Aufbereitung für Einflussgrößen-Klartext-Werte. `groesseCode`
// UND `anlassCode` sind in `EinflussgroesseDetail` bewusst offene `string`-
// Felder (kein generierter TS-Union — der Katalog ist DB-governt/erweiterbar,
// s. `einflussgroesseConstants.ts`s Kopf-Kommentar) — `t()` prüft
// Schlüssel nur für LITERALE Pfade zur Compile-Zeit, ein Lookup über
// `Record<string, MessageKey>` mit Rohcode-Fallback ist daher nötig (anders
// als `betroffenerTyp`/`quelleTyp`/`rechtsgrundlage`, die ECHTE OpenAPI-Enums
// sind und daher direkt per Template-Literal auf `t()` abgebildet werden,
// analog `useSystemDetailView.ts#statusLabel`).

import type { EinflussgroesseDetail } from '@edms/shared';
import { einheitFuerGroesseCode } from '../../api/einflussgroesse';
import { t, type MessageKey } from '../../../../shared/i18n/t';

const GROESSE_CODE_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  nutzungszweck: 'stammdaten.einflussgroesse.katalog.nutzungszweck',
  energietraeger_mix: 'stammdaten.einflussgroesse.katalog.energietraegerMix',
  personenanzahl: 'stammdaten.einflussgroesse.katalog.personenanzahl',
  nutzflaeche: 'stammdaten.einflussgroesse.katalog.nutzflaeche',
  geraeteabschaffung: 'stammdaten.einflussgroesse.katalog.geraeteabschaffung',
};

const NUTZUNGSZWECK_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  wohnen: 'stammdaten.einflussgroesse.nutzungszweck.wohnen',
  buero: 'stammdaten.einflussgroesse.nutzungszweck.buero',
  handel: 'stammdaten.einflussgroesse.nutzungszweck.handel',
  produktion: 'stammdaten.einflussgroesse.nutzungszweck.produktion',
  lager: 'stammdaten.einflussgroesse.nutzungszweck.lager',
  sonstige: 'stammdaten.einflussgroesse.nutzungszweck.sonstige',
};

const ANLASS_CODE_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  ersterfassung: 'stammdaten.common.enums.einflussAnlassCode.ersterfassung',
  turnusaktualisierung: 'stammdaten.common.enums.einflussAnlassCode.turnusaktualisierung',
  korrektur: 'stammdaten.common.enums.einflussAnlassCode.korrektur',
  systemgrenzenaenderung: 'stammdaten.common.enums.einflussAnlassCode.systemgrenzenaenderung',
  meldung_aenderung: 'stammdaten.common.enums.einflussAnlassCode.meldung_aenderung',
  sonstige: 'stammdaten.common.enums.einflussAnlassCode.sonstige',
};

/** Bekannte (`EINFLUSS_KATALOG`) Codes -> deutsches Label; unbekannte (künftig erweiterte) Codes -> Rohcode als Fallback. */
export function groesseCodeLabel(code: string): string {
  const key = GROESSE_CODE_LABEL_KEYS[code];
  return key !== undefined ? t(key) : code;
}

export function anlassCodeLabel(code: string | null): string {
  if (code === null) {
    return t('stammdaten.common.keineAngabe');
  }
  const key = ANLASS_CODE_LABEL_KEYS[code];
  return key !== undefined ? t(key) : code;
}

/**
 * Klartext-Wert-Anzeige (A8/B10: `wertNum` bleibt IMMER `string`, NIEMALS
 * `Number()`-gewandelt — Präzisionserhalt eines PII-Werts). `wertCode` bei
 * `nutzungszweck` wird gegen die B12.5-Liste gelabelt, sonst roh angezeigt
 * (`energietraeger_mix`/`geraeteabschaffung` haben in dieser Version keine
 * geschlossene Werteliste).
 */
export function wertAnzeige(item: Pick<EinflussgroesseDetail, 'groesseCode' | 'wertNum' | 'wertCode'>): string {
  if (item.wertNum !== null) {
    const einheit = einheitFuerGroesseCode(item.groesseCode);
    return einheit !== undefined ? `${item.wertNum} ${einheit}` : item.wertNum;
  }
  if (item.wertCode !== null) {
    if (item.groesseCode === 'nutzungszweck') {
      const key = NUTZUNGSZWECK_LABEL_KEYS[item.wertCode];
      return key !== undefined ? t(key) : item.wertCode;
    }
    return item.wertCode;
  }
  return t('stammdaten.common.keineAngabe');
}
