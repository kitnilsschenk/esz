/**
 * Verkettet mehrere Hinweis-Bausteine eines Formularfelds zu EINEM
 * `hint`-Text.
 *
 * Hintergrund: An den Fremdschlüssel-Auswahlfeldern treffen zwei
 * unabhängige Hinweise aufeinander — die fachliche Erklärung des Felds
 * („Die Bilanzgrenze, zu der dieser Zähler beiträgt") und der situative
 * Kürzungs-Hinweis aus `referenzOptionen` („nur die ersten 100 Einträge").
 * Beide als `hint` zu setzen hieße, dass einer den anderen still
 * überschreibt. Diese Funktion fügt sie stattdessen zusammen und lässt
 * fehlende Teile weg.
 *
 * Liefert `undefined`, wenn nichts übrig bleibt — passt damit direkt in das
 * `...(x !== undefined ? { hint: x } : {})`-Muster, das
 * `exactOptionalPropertyTypes` hier verlangt.
 */
export function verketteHinweise(...teile: readonly (string | undefined)[]): string | undefined {
  const vorhandene = teile.filter((teil): teil is string => teil !== undefined && teil.length > 0);
  return vorhandene.length > 0 ? vorhandene.join(' ') : undefined;
}
