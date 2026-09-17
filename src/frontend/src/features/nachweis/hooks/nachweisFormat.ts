// Reine Formatierungs-/Aufbereitungsfunktionen des Nachweis-Kontexts —
// bewusst OHNE React/DOM-Bezug (Testbarkeit, „keine Formatierungs-Logik im
// JSX"), analog `stammdaten/hooks/berechnung/berechnungFormat.ts`.
//
// Zahl-, Monats- und Qualitätsstufen-Formate werden von dort WIEDERVERWENDET
// statt kopiert — es sind dieselben Größen aus derselben Rechen-Domäne. Hier
// stehen nur die Formate, die es dort nicht gibt.

import type {
  AusschlussGrundCode,
  EinreichungArt,
  EinreichungUebermittlungsweg,
  EinsparlaufArt,
  EinsparlaufAusloeser,
  EinsparlaufErgebnisStatus,
  ExportKategorie,
  ExportStationDarstellung,
  JahresQualitaetsStufe,
  KorrekturGrundCode,
  MonatsBehandlung,
  NachweisExportZweck,
  DefinitionQuelle,
  PreflightErgebnis,
  PreflightSchwere,
} from '@edms/shared';
import type { BadgeProps } from '../../../shared/ui/badge';
import { formatiereMonat } from '../../stammdaten/hooks/berechnung';
import { formatiereKalenderdatum } from '../../../shared/format/datum';
import { t } from '../../../shared/i18n/t';

export type BadgeVariante = NonNullable<BadgeProps['variant']>;

const ZAHL_FORMAT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

/**
 * Ganzzahlen mit Tausendertrennung (Zeilen-, Monats-, Paar-Zähler). Für
 * Energiemengen gilt weiterhin `formatiereKwh` aus `berechnungFormat.ts` —
 * dort mit Nachkommastellen und Einheit.
 */
export function formatiereAnzahl(wert: number): string {
  return ZAHL_FORMAT.format(wert);
}

/**
 * `zeilenAnzahl`/`zeilenAnzahlGesamt` kommen als STRING über die API
 * (`bigint`-Herkunft). Nicht parsbare Werte werden unverändert
 * durchgereicht, statt „NaN" anzuzeigen.
 */
export function formatiereBigintAnzahl(wert: string): string {
  const zahl = Number(wert);
  return Number.isFinite(zahl) ? formatiereAnzahl(zahl) : wert;
}

/**
 * Zeitraum eines Förderjahres. `vonMonat` und `bisMonat` sind BEIDE
 * inklusive Monatserste — anders als `periodeBis` eines Berechnungslaufs
 * (dort exklusiv). Deshalb eine eigene Funktion statt `formatierePeriode`
 * aus `berechnungFormat.ts`: dieselbe Anzeige mit der falschen Grenzsemantik
 * wäre um einen Monat verschoben.
 */
export function formatiereFoerderjahrZeitraum(vonMonat: string, bisMonat: string): string {
  const von = formatiereMonat(vonMonat);
  const bis = formatiereMonat(bisMonat);
  return von === bis ? von : `${von} – ${bis}`;
}

/**
 * Der Zeitraum eines Förderjahres — taggenau, wenn er es ist.
 *
 * Ein Förderjahr aus einem Bewilligungsbescheid beginnt selten am
 * Monatsersten (V0070). Nur die Monate zu zeigen, wo der Bescheid Tage nennt,
 * wäre die falsche Auskunft: Der Nachweis rechnet dann elf Tage anders, als
 * die Oberfläche behauptet.
 *
 * Deckt sich der Zeitraum genau mit den Monaten, bleibt die kürzere
 * Monatsdarstellung — sie liest sich besser, und es geht nichts verloren.
 * `bisTag` ist EXKLUSIV und wird für die Anzeige auf den letzten enthaltenen
 * Tag zurückgerechnet: „bis 11.10." ist das, was im Bescheid steht, nicht
 * „bis 12.10.".
 */
export function formatiereFoerderjahrSpanne(
  vonMonat: string,
  bisMonat: string,
  vonTag: string,
  bisTag: string,
): string {
  const ersterDesMonats = vonTag.endsWith('-01');
  const letzterEnthaltener = new Date(Date.parse(`${bisTag}T00:00:00.000Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const endetMitMonat = new Date(Date.parse(`${bisTag}T00:00:00.000Z`)).toISOString().slice(8, 10) === '01';

  if (ersterDesMonats && endetMitMonat) {
    return formatiereFoerderjahrZeitraum(vonMonat, bisMonat);
  }
  return `${formatiereKalenderdatum(vonTag)} – ${formatiereKalenderdatum(letzterEnthaltener)}`;
}

export function definitionQuelleLabel(quelle: DefinitionQuelle): string {
  return t(`nachweis.enums.definitionQuelle.${quelle}`);
}

export function preflightErgebnisLabel(ergebnis: PreflightErgebnis): string {
  return t(`nachweis.enums.preflightErgebnis.${ergebnis}`);
}

export function preflightErgebnisBadgeVariante(ergebnis: PreflightErgebnis): BadgeVariante {
  return ergebnis === 'gruen' ? 'success' : 'destructive';
}

export function preflightSchwereLabel(schwere: PreflightSchwere): string {
  return t(`nachweis.enums.preflightSchwere.${schwere}`);
}

export function preflightSchwereBadgeVariante(schwere: PreflightSchwere): BadgeVariante {
  if (schwere === 'blocker') {
    return 'destructive';
  }
  return schwere === 'warnung' ? 'warning' : 'outline';
}

/**
 * Regel-Codes, für die ein deutscher Klartext hinterlegt ist. Die API führt
 * `regelCode` bewusst als offenen String („aus dem Verfahrenskatalog gelesen,
 * hier nicht abschließend aufgezählt") — ein neuer Katalog-Eintrag darf die
 * Oberfläche nicht zum Absturz bringen. Unbekannte Codes werden deshalb roh
 * angezeigt statt übersetzt.
 */
const BEKANNTE_REGEL_CODES = [
  'FJ-01',
  'FJ-02',
  'FJ-03',
  'FJ-04',
  'FJ-05',
  'FJ-06',
  'FJ-07a',
  'FJ-07b',
  'FJ-07c',
  'FJ-08',
  'FJ-09',
  'FJ-10',
  'FJ-11a',
  'FJ-11b',
  'FJ-11c',
] as const;

type BekannterRegelCode = (typeof BEKANNTE_REGEL_CODES)[number];

function istBekannterRegelCode(code: string): code is BekannterRegelCode {
  return (BEKANNTE_REGEL_CODES as readonly string[]).includes(code);
}

/** Klartext zu einem Prüfregel-Code, oder der Code selbst, wenn er (noch) unbekannt ist. */
export function regelCodeLabel(code: string): string {
  return istBekannterRegelCode(code) ? t(`nachweis.enums.regelCode.${code}`) : code;
}

/**
 * Befunde, die zwar die Schwere `blocker` tragen, aber NUR das betroffene
 * Endkunden-Energieträger-Paar ausschließen — sie halten den Förderjahres-
 * Nachweis nicht auf und zählen serverseitig nicht in `blockerAnzahl`.
 *
 * Ohne diese Unterscheidung wäre die Oberfläche in sich widersprüchlich: Sie
 * zeigte rote „Blocker"-Zeilen unter einer grünen Ampel. Die Liste spiegelt
 * `AUSGENOMMENE_FOERDERJAHR_BLOCKER_REGEL_CODES`
 * (`src/backend/src/nachweis/verfahren.const.ts`); kommt dort einer hinzu,
 * gehört er auch hierher.
 */
const NUR_PAAR_BEZOGENE_BLOCKER: readonly string[] = ['FJ-07c', 'FJ-11c', 'FJ-10'];

export function istNurPaarBezogenerBlocker(regelCode: string, schwere: PreflightSchwere): boolean {
  return schwere === 'blocker' && NUR_PAAR_BEZOGENE_BLOCKER.includes(regelCode);
}

/**
 * Blocker, die aus dem **Systemzustand** entstehen, nicht aus den Daten des
 * geprüften Förderjahres — und die deshalb durch keine Datenpflege verschwinden:
 *
 * - `FJ-09` steht, solange der Betrieb auf synthetischen Testdaten läuft.
 * - `FJ-08` stand, solange der Quellenvermerk der Klimadaten nicht endgültig
 *   hinterlegt war. Seit der A-1-Freigabe (2026-09-09) feuert er nicht mehr;
 *   der Code bleibt in der Liste, weil eine Kennzeichnung, die erst beim
 *   Wiederauftreten nachgezogen werden müsste, genau dann fehlte, wenn sie
 *   gebraucht wird.
 *
 * Ohne diese Kennzeichnung liest sich die Aufforderung „Beheben Sie die unten
 * gelisteten Blocker" als lösbare Aufgabe, und wer sie annimmt, sucht in den
 * Stammdaten nach einer Ursache, die dort nicht liegt.
 */
const SYSTEMBEDINGTE_BLOCKER: readonly string[] = ['FJ-08', 'FJ-09'];

export function istSystembedingterBlocker(regelCode: string, schwere: PreflightSchwere): boolean {
  return schwere === 'blocker' && SYSTEMBEDINGTE_BLOCKER.includes(regelCode);
}

/**
 * Die Nachweis-Spec führt `energietraeger` an Befunden, Ergebnis- und
 * Bindungszeilen als OFFENEN String (nicht als geschlossene Werteliste wie im
 * Stammdaten-Kontext). Bekannte Werte bekommen deshalb das übliche deutsche
 * Label, unbekannte werden roh angezeigt statt die Anzeige zum Absturz zu
 * bringen — dasselbe Muster wie bei `regelCodeLabel`.
 */
const ENERGIETRAEGER_WERTE = ['strom', 'waerme', 'kaelte', 'gas', 'oel', 'biomasse'] as const;

type BekannterEnergietraeger = (typeof ENERGIETRAEGER_WERTE)[number];

function istBekannterEnergietraeger(code: string): code is BekannterEnergietraeger {
  return (ENERGIETRAEGER_WERTE as readonly string[]).includes(code);
}

export function energietraegerLabel(code: string): string {
  return istBekannterEnergietraeger(code) ? t(`stammdaten.common.enums.energietraeger.${code}`) : code;
}

export function einsparlaufArtLabel(art: EinsparlaufArt): string {
  return t(`nachweis.enums.einsparlaufArt.${art}`);
}

export function einsparlaufAusloeserLabel(ausloeser: EinsparlaufAusloeser): string {
  return t(`nachweis.enums.einsparlaufAusloeser.${ausloeser}`);
}

export function ergebnisStatusLabel(status: EinsparlaufErgebnisStatus): string {
  return t(`nachweis.enums.ergebnisStatus.${status}`);
}

export function ergebnisStatusBadgeVariante(status: EinsparlaufErgebnisStatus): BadgeVariante {
  if (status === 'ausgewiesen') {
    return 'success';
  }
  return status === 'nicht_nachweisbar' ? 'warning' : 'outline';
}

export function ausschlussGrundLabel(grund: AusschlussGrundCode): string {
  return t(`nachweis.enums.ausschlussGrund.${grund}`);
}

/**
 * Jahres-Qualitätsstufe einer Ergebniszeile. EIGENE Domäne — `nicht_nachweisbar`
 * statt `nicht_ausweisbar` der Monats-Stufe; `qualitaetsStufeLabel` aus
 * `berechnungFormat.ts` würde hier auf einen fehlenden Schlüssel laufen.
 */
export function jahresQualitaetsStufeLabel(stufe: JahresQualitaetsStufe): string {
  return t(`nachweis.enums.jahresQualitaetsStufe.${stufe}`);
}

export function jahresQualitaetsStufeBadgeVariante(stufe: JahresQualitaetsStufe): BadgeVariante {
  if (stufe === 'belastbar') {
    return 'success';
  }
  return stufe === 'eingeschraenkt' ? 'warning' : 'destructive';
}

export function monatsBehandlungLabel(behandlung: MonatsBehandlung): string {
  return t(`nachweis.enums.monatsBehandlung.${behandlung}`);
}

export function exportZweckLabel(zweck: NachweisExportZweck): string {
  return t(`nachweis.enums.exportZweck.${zweck}`);
}

export function exportKategorieLabel(kategorie: ExportKategorie): string {
  return t(`nachweis.enums.exportKategorie.${kategorie}`);
}

export function stationDarstellungLabel(darstellung: ExportStationDarstellung): string {
  return t(`nachweis.enums.stationDarstellung.${darstellung}`);
}

export function einreichungArtLabel(art: EinreichungArt): string {
  return t(`nachweis.enums.einreichungArt.${art}`);
}

export function uebermittlungswegLabel(weg: EinreichungUebermittlungsweg): string {
  return t(`nachweis.enums.uebermittlungsweg.${weg}`);
}

export function korrekturGrundLabel(code: KorrekturGrundCode): string {
  return t(`nachweis.enums.korrekturGrundCode.${code}`);
}

/** „ja"/„nein" für boolesche Detailfelder (`synthetic`, `de04Auszug`). */
export function jaNein(wert: boolean): string {
  return wert ? t('nachweis.gemeinsam.ja') : t('nachweis.gemeinsam.nein');
}
