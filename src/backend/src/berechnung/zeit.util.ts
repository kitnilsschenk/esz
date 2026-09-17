/**
 * Die Zeit-Hilfen der Berechnung.
 *
 * Die Zerlegung in Monatsscheiben liegt seit der Umstellung auf taggenaue
 * Perioden in `common/zeit/zeitscheibe.util.ts` — sie wird auch vom Nachweis
 * gebraucht (Preflight und Einsparlauf lösen je Scheibe eine Bindung auf),
 * und zwei Kopien wären die Stelle, an der Berechnung und Bindung
 * auseinanderlaufen. Der Re-Export hält die bisherigen Importpfade gültig.
 */
export { enumerateDays, enumerateMonths, istMonatsanfang } from '../common/zeit/zeitscheibe.util';
export type { Monatsscheibe } from '../common/zeit/zeitscheibe.util';
