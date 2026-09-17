// Reine Formatierungs-/Aufbereitungsfunktionen der Berechnungslauf-Ansicht —
// bewusst OHNE React/DOM-Bezug (Testbarkeit, "keine Business-/Formatierungs-
// Logik im JSX"), analog `verbrauchZeitraum.ts`. Die View-Hooks
// (`useBerechnungslaufListeView`/`useBerechnungslaufDetailView`) konsumieren
// diese Funktionen nur, ändern sie nicht selbst.

import type { Ausloeser, QualitaetsStufe } from '@edms/shared';
import type { BadgeProps } from '../../../../shared/ui/badge';
import { t } from '../../../../shared/i18n/t';

function parseDatumUtc(datumIso: string): Date {
  return new Date(`${datumIso.slice(0, 10)}T00:00:00.000Z`);
}

const MONAT_FORMAT = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Formatiert einen `date`-String (`yyyy-mm-dd`, lokaler Monatserster) als "Januar 2026" (de-DE). */
export function formatiereMonat(datumIso: string): string {
  return MONAT_FORMAT.format(parseDatumUtc(datumIso));
}

/**
 * Formatiert `[periodeVon, periodeBisExklusiv)` als menschenlesbaren
 * Monats-Bereich. `periodeBis` ist der erste Kalendertag NACH dem letzten
 * Zielmonat (halboffen, `berechnungslauf.types.ts`) — hier auf den
 * tatsächlich LETZTEN Zielmonat zurückgerechnet, damit die Anzeige nicht
 * einen Monat zu weit reicht.
 */
export function formatierePeriode(periodeVon: string, periodeBisExklusiv: string): string {
  const letzterMonat = parseDatumUtc(periodeBisExklusiv);
  letzterMonat.setUTCMonth(letzterMonat.getUTCMonth() - 1);
  const vonLabel = formatiereMonat(periodeVon);
  const bisLabel = MONAT_FORMAT.format(letzterMonat);
  return vonLabel === bisLabel ? vonLabel : `${vonLabel} – ${bisLabel}`;
}

const ZAHL_FORMAT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const PROZENT_FORMAT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

/** Reines de-DE-Zahlenformat OHNE Einheit — Y-Achsen-Ticks des Monatsdiagramms (Einheit steht dort bereits im Diagrammtitel). */
export function formatiereZahl(wert: number): string {
  return ZAHL_FORMAT.format(wert);
}

/** de-DE-Zahlenformat + kWh-Einheit (Baseline-/Referenz-/Ist-Werte). */
export function formatiereKwh(wertKwh: number): string {
  return `${ZAHL_FORMAT.format(wertKwh)} kWh`;
}

/**
 * Einsparung eines Monats: Referenz minus Ist, mit VORZEICHEN.
 *
 * Positiv = eingespart, negativ = mehr verbraucht. Das Vorzeichen ist die
 * Aussage; ein Betrag liesse Mehrverbrauch wie Einsparung aussehen — dieselbe
 * Konvention wie im Monatsbericht (`deltaKwh`, V0054).
 */
export function formatiereEinsparung(referenzKwh: number, istKwh: number): string {
  const delta = referenzKwh - istKwh;
  const vorzeichen = delta > 0 ? '+' : '';
  return `${vorzeichen}${ZAHL_FORMAT.format(delta)} kWh`;
}

/** de-DE-Zahlenformat + Kd-Einheit (Gradtagzahlen `gtzBase`/`gtzNorm`/`gtzIst`). */
export function formatiereGradtagzahl(wertKd: number): string {
  return `${ZAHL_FORMAT.format(wertKd)} Kd`;
}

/** `grundlastAnteil` (Anteil `0..1`, `berechnungslauf-anlegen.dto.ts` `@Min(0) @Max(1)`) als Prozentwert. */
export function formatiereAnteilAlsProzent(anteil0Bis1: number): string {
  return `${PROZENT_FORMAT.format(anteil0Bis1 * 100)} %`;
}

/** `abdeckungPct` liegt bereits auf der 0–100-Skala (`berechnungslauf.service.ts`: `100 * tageGemessen / tageImMonat`). */
export function formatiereProzentwert(wert0Bis100: number): string {
  return `${PROZENT_FORMAT.format(wert0Bis100)} %`;
}

/**
 * Ein dimensionsloser Koeffizient mit vier Nachkommastellen — R² (V0076).
 *
 * Bewusst KEINE Prozentdarstellung: R² ist kein Anteil. Es kann grösser als
 * die Streuung erklären und bei einem schlechten Modell negativ werden; als
 * „−12 %" gelesen wäre das irreführend.
 */
export function formatiereKoeffizient(wert: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(wert);
}

export function formatiereVerfahren(verfahrenCode: string, verfahrenVersion: number): string {
  return `${verfahrenCode} (v${String(verfahrenVersion)})`;
}

export function qualitaetsStufeLabel(stufe: QualitaetsStufe): string {
  return t(`stammdaten.common.enums.qualitaetsStufe.${stufe}`);
}

/**
 * Badge-Variante je Qualitätsstufe (B12.4-Schwelle): `belastbar` → `success`,
 * `eingeschraenkt` → `warning`, `nicht_ausweisbar` → `destructive` — dieselbe
 * Ampel-Semantik wie `AusfallStatusZelle` (Badge-Primitive, Design-System).
 */
export function qualitaetsStufeBadgeVariante(stufe: QualitaetsStufe): NonNullable<BadgeProps['variant']> {
  if (stufe === 'belastbar') {
    return 'success';
  }
  if (stufe === 'eingeschraenkt') {
    return 'warning';
  }
  return 'destructive';
}

export function ausloeserLabel(ausloeser: Ausloeser): string {
  return t(`stammdaten.common.enums.ausloeser.${ausloeser}`);
}
