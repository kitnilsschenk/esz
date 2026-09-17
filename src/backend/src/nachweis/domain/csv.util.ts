/**
 * ADR-0007 B5/D5 + O-B8 (`bafa-export-engineer`-Vorschlag, BESTÄTIGUNGSBEDÜRFTIG
 * — s. finale Antwort dieses Arbeitspakets) — kanonische, deterministische
 * CSV-Serialisierung für den Nachweis-Export. REINE Domäne: keine I/O, kein
 * `Date.now()`, kein `Math.random()`, keine Locale-Funktionen (`toLocale*`).
 *
 * O-B8-Konvention (Empfehlung aus ADR-0007 B5, hier UMGESETZT):
 *   - Encoding: UTF-8, KEIN BOM.
 *   - Trennzeichen: `,` (RFC 4180), Feld-Quoting nach RFC 4180 §2.5-2.7
 *     (Anführungszeichen bei Komma/Anführungszeichen/CR/LF im Feld,
 *     eingebettete Anführungszeichen verdoppelt).
 *   - Zeilenende: `\r\n` (RFC 4180 §2.1 wörtlich), EINSCHLIESSLICH nach der
 *     letzten Datenzeile (kein "letzte Zeile ohne Terminator"-Sonderfall —
 *     weniger Fallunterscheidungen, mehr Determinismus).
 *   - Dezimaltrenner: Punkt (`Number.prototype.toFixed`, NIEMALS
 *     `toLocaleString()`), feste Nachkommastellenzahl je Feldtyp (Konvention
 *     ADR-0006 B12/`witterung-gtz.ts`).
 *   - Datumswerte: ISO-8601 `YYYY-MM-DD` (bereits das Format aller
 *     `nachweis`/`analytics`-Repository-DTOs, s. `pg-date.util.ts`).
 * KEINE XLSX-Beilage in diesem Paket (D5 nennt sie als optionale
 * Empfänger-Bequemlichkeit, „nie die Nachweisgrundlage" — nicht Teil des
 * Arbeitsauftrags „Zu bauen").
 */

const FELD_MUSS_QUOTEN = /[",\r\n]/;

/** RFC 4180 §2.5-2.7 — ein einzelnes CSV-Feld. `null`/`undefined` → leeres Feld (nie das Literal `"null"`). */
export function csvFeld(wert: string | number | boolean | null | undefined): string {
  if (wert === null || wert === undefined) {
    return '';
  }
  const text = typeof wert === 'string' ? wert : String(wert);
  if (FELD_MUSS_QUOTEN.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Eine CSV-Zeile (OHNE Zeilenterminator — s. `csvDokument()`). */
export function csvZeile(felder: readonly (string | number | boolean | null | undefined)[]): string {
  return felder.map(csvFeld).join(',');
}

/**
 * Vollständiges CSV-Dokument: Header + Datenzeilen, JEDE Zeile inkl. `\r\n`
 * (auch die letzte) — ein fester, dokumentierter Determinismus-Vertrag (s.
 * Datei-Kopf). Der Aufrufer liefert BEREITS deterministisch sortierte Zeilen
 * (Ordnung ist fachliche Aufrufer-Verantwortung, Muster `sha256Canonical()`).
 */
export function csvDokument(
  header: readonly string[],
  zeilen: readonly (readonly (string | number | boolean | null | undefined)[])[],
): string {
  const alle = [header, ...zeilen];
  return alle.map((zeile) => `${csvZeile(zeile)}\r\n`).join('');
}

/**
 * Feste Nachkommastellen-Formatierung (B13.5-Konvention) — NIEMALS
 * `toLocaleString()`. Normalisiert `-0`/rundungsbedingt-negative Null
 * (`(-0.0001).toFixed(3) === '-0.000'`) auf `'0.000'` — rein kosmetisch
 * (dieselbe Zahl), aber ein deterministisch reproduzierbares, lesbareres
 * Artefakt (kein „minus null" in einer Nachweisunterlage).
 */
export function formatiereDezimal(wert: number, nachkommastellen: number): string {
  const formatiert = wert.toFixed(nachkommastellen);
  if (Number(formatiert) === 0 && formatiert.startsWith('-')) {
    return formatiert.slice(1);
  }
  return formatiert;
}
