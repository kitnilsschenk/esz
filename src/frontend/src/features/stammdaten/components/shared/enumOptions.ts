import type { EntityFormSelectOption } from './EntityForm';

/**
 * Baut `EntityFormSelectOption[]` aus einer festen Enum-Wertliste (z. B.
 * `Energietraeger`, `MessgroesseArt`, `Datenklasse`, `NutzungsRolle`) + einer
 * Label-Funktion (üblicherweise `(wert) => t(\`stammdaten.common.enums.…\`)`).
 * Für Fremdschlüssel-Referenz-Auswahllisten (Endkunde/System/Anschlussnutzer,
 * aus einer Liste-Query abgeleitet) wird diese Fabrik NICHT verwendet — dort
 * baut jeder View-Hook die Optionsliste direkt aus den geladenen Datensätzen
 * (siehe `hooks/system/useSystemAnlegenView.ts`).
 */
export function enumSelectOptions<TWert extends string>(
  werte: readonly TWert[],
  label: (wert: TWert) => string,
): readonly EntityFormSelectOption[] {
  return werte.map((wert) => ({ value: wert, label: label(wert) }));
}
