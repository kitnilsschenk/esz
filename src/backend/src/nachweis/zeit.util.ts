/**
 * ADR-0007 B4 — „die erwartete Monatsmenge ist die Menge der Monatsersten in
 * `[von_monat, bis_monat]`" — ANDERS als `enumerateMonths` (dort `[von, bis)`,
 * halboffen): `nachweis.foerderjahr` trägt `bis_monat` INKLUSIV (V0025-CHECK
 * `bis_monat >= von_monat`, beide Monatserste). Ein STILLES Off-by-one-Risiko
 * (halboffen vs. inklusiv) ist genau die Art Fehler, die eine eigene, klar
 * benannte Funktion vermeidet.
 *
 * **Seit V0070 ist das nicht mehr die tragende Zerlegung.** Ein Förderjahr
 * hat taggenaue Grenzen, und seine Ränder dürfen mitten im Monat liegen; die
 * Bindung läuft deshalb über `scheibenDesFoerderjahres()` (unten) und nicht
 * mehr über die blosse Menge der Monatsersten. `enumerateMonthsInclusive`
 * bleibt für alles, was wirklich nur Monatsetiketten braucht.
 */
import { enumerateMonths } from '../common/zeit/zeitscheibe.util';
import type { Monatsscheibe } from '../common/zeit/zeitscheibe.util';

export type { Monatsscheibe };

/**
 * Die Zeitscheiben eines Förderjahres — die Einheit, gegen die gebunden wird.
 *
 * **Warum nicht die Monatsersten.** Zwei aufeinanderfolgende Förderjahre
 * TEILEN SICH einen Kalendermonat, sobald der Bewilligungszeitraum nicht am
 * Monatsersten beginnt: Das eine endet am 11.10., das nächste beginnt am
 * 12.10. Über den blossen Monatsersten liessen sich die beiden Anteile nicht
 * unterscheiden — die Bindung des zweiten Förderjahres fand für „Oktober" den
 * Berechnungslauf des ERSTEN und rechnete elf fremde Tage mit.
 *
 * Die Scheibe trägt beides: den Monatsersten als Kennung (so heisst die Zeile
 * in `analytics.laufergebnis`) und die tatsächlichen Tage. Erst damit ist die
 * zeitanteilige Ermittlung möglich, die Kap. 9.1 des Technischen Merkblatts
 * v2.2 verlangt.
 */
export function scheibenDesFoerderjahres(vonTag: string, bisTagExklusiv: string): readonly Monatsscheibe[] {
  return enumerateMonths(vonTag, bisTagExklusiv);
}

/** `true`, wenn `datum` (ISO `YYYY-MM-DD`) der ERSTE Kalendertag eines Monats ist. */
export function istMonatsanfang(datum: string): boolean {
  return new Date(`${datum}T00:00:00.000Z`).getUTCDate() === 1;
}

function toIsoTag(datum: Date): string {
  const jahr = String(datum.getUTCFullYear()).padStart(4, '0');
  const monat = String(datum.getUTCMonth() + 1).padStart(2, '0');
  const tag = String(datum.getUTCDate()).padStart(2, '0');
  return `${jahr}-${monat}-${tag}`;
}

/**
 * Alle Monatsersten in `[vonMonat, bisMonat]` (BEIDE inklusiv, BEIDE
 * Monatsanfänge — vom Aufrufer vorab über `istMonatsanfang()` zu prüfen,
 * sonst `RangeError`). Leeres Ergebnis ist strukturell ausgeschlossen, wenn
 * `bisMonat >= vonMonat` (DB-CHECK `ck_foerderjahr_bis_monat_erster`
 * garantiert das für `nachweis.foerderjahr`-Zeilen bereits).
 */
export function enumerateMonthsInclusive(vonMonat: string, bisMonat: string): string[] {
  if (!istMonatsanfang(vonMonat) || !istMonatsanfang(bisMonat)) {
    throw new RangeError('vonMonat und bisMonat muessen Monatsanfaenge sein.');
  }

  const start = new Date(`${vonMonat}T00:00:00.000Z`);
  const ende = new Date(`${bisMonat}T00:00:00.000Z`);
  const monate: string[] = [];

  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const grenze = new Date(Date.UTC(ende.getUTCFullYear(), ende.getUTCMonth(), 1));
  while (cursor.getTime() <= grenze.getTime()) {
    monate.push(toIsoTag(cursor));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return monate;
}

/** Der Monatserste des Folgemonats von `monat` (ISO `YYYY-MM-01`) — EXKLUSIVE Obergrenze für SQL-Bereichsvergleiche. */
export function naechsterMonat(monat: string): string {
  const datum = new Date(`${monat}T00:00:00.000Z`);
  return toIsoTag(new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth() + 1, 1)));
}

/**
 * V0023 „OFFENER KLÄRUNGSPUNKT" Punkt (2) (ADR-0006 P4/ADR-0007 A12,
 * Anschlussnutzer-Sperr-Auswertung) — die dort ausdrücklich verlangte
 * EXPLIZITE Zeitzonen-Verankerung für den Overlap-Vergleich
 * `energy.nutzungsverhaeltnis.gueltig_von/gueltig_bis` (`timestamptz`) gegen
 * `analytics.berechnungslauf.periode_von/periode_bis` (`date`, lokaler
 * Kalendertag).
 *
 * NICHT geraten, sondern die im Repo BEREITS ETABLIERTE Konvention für genau
 * dieses Problem übernommen (`berechnung/berechnungslauf.service.ts`s
 * `TAGES_ZEITZONE_DEFAULT`/`BerechnungslaufParameterDto.tagesZeitzone`,
 * Schema-Default `analytics.verfahren_version.parameter_schema.
 * properties.tages_zeitzone.default`): `'Europe/Berlin'`.
 *
 * WICHTIGE PRÄZISIERUNG gegenüber einer reinen Literal-Wiederholung: jeder
 * `analytics.berechnungslauf` FRIERT die für IHN tatsächlich verwendete
 * Zeitzone bereits in seiner eigenen `parameter`-Spalte ein
 * (`parameter->>'tages_zeitzone'`, s. `berechnungslauf.service.ts`
 * `const parameter = { ..., tages_zeitzone: effektiv.tagesZeitzone }`) — ADR-0006
 * D4 wörtlich: „je Lauf eingefroren". `AnalyticsLaufLookupRepository.
 * findAnschlussnutzerSperrenFuerPaar()` liest DAHER bevorzugt DIESEN
 * per-Lauf-Wert (`COALESCE(bl.parameter->>'tages_zeitzone', ...)`) und
 * verwendet diese Konstante NUR als Fallback für den (heute nicht bekannten,
 * strukturell aber möglichen) Fall einer fehlenden Angabe — KEIN neuer,
 * unabhängiger Default, sondern derselbe Wert, den auch die
 * Berechnungs-Pipeline selbst als Default einsetzt.
 */
export const TAGES_ZEITZONE_DEFAULT = 'Europe/Berlin';
