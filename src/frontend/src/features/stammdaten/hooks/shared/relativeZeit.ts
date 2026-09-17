import { t } from '../../../../shared/i18n/t';

const MINUTE_MS = 60 * 1000;
const STUNDE_MS = 60 * MINUTE_MS;
const TAG_MS = 24 * STUNDE_MS;

/**
 * Formatiert einen ISO-UTC-Zeitstempel als groben, deutschen Relativ-Text
 * ("vor 3 Std.", "vor 2 Tagen") — Betriebs-UI-Konzept Punkt 3
 * „Datenfluss-Status"/Punkt 4 Messkanäle-Tabelle. Bewusst GROB (Minuten/
 * Stunden/Tage, kein `Intl.RelativeTimeFormat` mit Sekundengenauigkeit) — die
 * Freshness-Anzeige beantwortet „läuft's noch?", keine exakte Zeitmessung.
 * `jetzt` ist injizierbar (Default `new Date()`) — ausschließlich für
 * deterministische Tests, NIE fachlich verzweigt.
 */
export function formatiereRelativeZeit(zeitpunktIso: string, jetzt: Date = new Date()): string {
  const zeitpunkt = new Date(zeitpunktIso);
  const diffMs = jetzt.getTime() - zeitpunkt.getTime();

  if (diffMs < MINUTE_MS) {
    return t('stammdaten.common.relativeZeit.geradeEben');
  }
  if (diffMs < STUNDE_MS) {
    const minuten = Math.floor(diffMs / MINUTE_MS);
    return `${t('stammdaten.common.relativeZeit.vorPraefix')} ${String(minuten)} ${t('stammdaten.common.relativeZeit.minutenSuffix')}`;
  }
  if (diffMs < TAG_MS) {
    const stunden = Math.floor(diffMs / STUNDE_MS);
    return `${t('stammdaten.common.relativeZeit.vorPraefix')} ${String(stunden)} ${t('stammdaten.common.relativeZeit.stundenSuffix')}`;
  }
  const tage = Math.floor(diffMs / TAG_MS);
  return `${t('stammdaten.common.relativeZeit.vorPraefix')} ${String(tage)} ${t('stammdaten.common.relativeZeit.tagenSuffix')}`;
}
