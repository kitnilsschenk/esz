import de from './de.json';

// Minimaler, typisierter Zugriff auf deutsche UI-Strings
// (.claude/rules/frontend-react.md: „Deutsche UI-Strings aus
// src/frontend/src/shared/i18n/de.json, keine Inline-Strings“). Bewusst
// KEINE i18n-Bibliothek — nur Dot-Path-Auflösung mit
// Compile-Time-Schlüsselprüfung über `MessageKey`.

type Messages = typeof de;

type Path<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Path<T[K]>}`;
}[keyof T & string];

export type MessageKey = Path<Messages>;

/**
 * `de.json` einmalig beim Modul-Start zu einer flachen
 * `{'a.b.c': 'Text'}`-Tabelle ausrollen.
 *
 * Vorher lief JEDER `t()`-Aufruf über `key.split('.')` plus einen
 * Objekt-Walk — bei einer Tabelle mit hunderten Zeilen, in der jede Zelle
 * `t()` aufruft, summiert sich das pro Render spürbar, obwohl das Ergebnis
 * über die gesamte Laufzeit konstant ist (`de.json` ist statisch importiert
 * und wird nie mutiert). Jetzt: einmal O(n) beim Laden, danach O(1) je
 * Aufruf.
 */
function flach(quelle: unknown, praefix: string, ziel: Map<string, string>): void {
  if (typeof quelle !== 'object' || quelle === null) {
    return;
  }
  for (const [schluessel, wert] of Object.entries(quelle)) {
    const pfad = praefix === '' ? schluessel : `${praefix}.${schluessel}`;
    if (typeof wert === 'string') {
      ziel.set(pfad, wert);
    } else {
      flach(wert, pfad, ziel);
    }
  }
}

const NACHRICHTEN: ReadonlyMap<string, string> = (() => {
  const tabelle = new Map<string, string>();
  flach(de, '', tabelle);
  return tabelle;
})();

/**
 * Liefert den deutschen UI-String für `key` aus `de.json`.
 *
 * Wirft bei unbekanntem Schlüssel. Für LITERALE Aufrufe kann das nie
 * eintreten (`MessageKey` prüft sie zur Compile-Zeit); relevant ist es nur
 * für die per Template-Literal zusammengesetzten Aufrufe über offene
 * `string`-Felder (z. B. `t(\`…enums.energietraeger.${wert}\`)`) — dort ist
 * ein lauter Fehler dem stillen Anzeigen eines Roh-Codes vorzuziehen.
 */
export function t(key: MessageKey): string {
  const wert = NACHRICHTEN.get(key);
  if (wert === undefined) {
    throw new Error(`i18n: fehlender Schlüssel "${key}" (de.json).`);
  }
  return wert;
}
