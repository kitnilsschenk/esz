/**
 * KRITISCHER Finding (empirisch verifiziert, Integrationstest-Regression
 * `berechnungslauf.integration.spec.ts`): `pg`s Standard-Typ-Parser für die
 * SQL-Spalte `date` (OID 1082, KEIN Zeitzonen-Offset im Wert) konstruiert
 * das JS-`Date`-Objekt über den MEHR-ARGUMENT-Konstruktor
 * (`new Date(jahr, monat, tag, ...)`, `pg/lib/utils.js` `getDate()` —
 * wörtlicher Quelltext-Kommentar dort: "Force YYYY-MM-DD dates to be parsed
 * as local time") — das ist SEMANTISCH LOKALE Mitternacht, NICHT UTC-
 * Mitternacht. Anders als bei `timestamptz` (dort trägt der Rohwert selbst
 * einen Offset, `pg` rechnet korrekt nach UTC um, s.
 * `zaehler-verortung.controller.ts`s `toIsoStringKontextWert()`-Kommentar
 * zum ANALOGEN, aber technisch anderen `timestamptz`-Fall) — ein naives
 * `.toISOString().slice(0,10)` auf einem SOLCHEN `date`-Date würde je nach
 * lokaler Prozess-Zeitzone einen FALSCHEN Kalendertag liefern (bei
 * UTC-negativen Zonen z. B. einen Tag zu früh).
 *
 * VERBINDLICHE REGEL für dieses Modul (`berechnung/**`): JEDE SQL-`date`-
 * Spalte, die über `EntityManager.query()` (Roh-SQL-Pfad) gelesen wird,
 * MUSS durch `toIsoDateString()` — NICHT durch einen direkten
 * `row.spalte`-Durchgriff — in die kanonische `'YYYY-MM-DD'`-Repräsentation
 * überführt werden, bevor sie irgendwo als `string` weiterverwendet wird
 * (Persistenz-Repräsentation UND fachliche Tages-/Monats-Vergleiche im
 * Service laufen sonst STILL falsch — Datumsvergleiche gegen die
 * `string`-Werte aus `zeit.util.ts` würden nie treffen, s. Regressionstest).
 */
export function toIsoDateString(value: unknown): string {
  if (typeof value === 'string') {
    // Defensive Rückfalloption (z. B. eine künftige Treiber-/Konfigurations-
    // Änderung, die `date` bereits als String liefert) — im Regelfall
    // greift der `Date`-Zweig unten.
    return value;
  }

  if (value instanceof Date) {
    // LOKALE Getter (NICHT `getUTCFullYear()` etc.) — genau die Umkehrung
    // der `pg`-Konstruktion oben, liefert die URSPRÜNGLICHEN
    // Kalenderdatum-Komponenten zurück, unabhängig von der Prozess-Zeitzone.
    const jahr = String(value.getFullYear()).padStart(4, '0');
    const monat = String(value.getMonth() + 1).padStart(2, '0');
    const tag = String(value.getDate()).padStart(2, '0');
    return `${jahr}-${monat}-${tag}`;
  }

  throw new Error(`toIsoDateString(): unerwarteter Wert-Typ (weder string noch Date): ${typeof value}`);
}

/**
 * GESPIEGELT aus `stammdaten/persistence/pg-date.util.ts` (identisches
 * Muster wie bereits bei `toIsoTimestampStringOrNull` in dieser Datei
 * praktiziert) — für nullable `date`-Spalten wie `einfluss.intervall.
 * gueltig_bis_monat`/`analytics.eingang_einflussgroesse.gueltig_bis_monat`
 * (`NULL` = "bis heute gültig", D8.2).
 */
export function toIsoDateStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return toIsoDateString(value);
}

/**
 * ADR-0007 Stufe 2 (Nachweis-Export, `nachweis-export.repository.ts`) —
 * NACHGETRAGEN, GESPIEGELT aus `stammdaten/persistence/pg-date.util.ts`
 * (identischer, dort bereits dokumentierter Finding: `timestamptz`-Spalten
 * — OID 1184 — tragen den Offset bereits im Rohwert, `pg` liefert
 * korrekt ein `Date`-Objekt; `new Date(value).toISOString()` deckt sowohl
 * ein bereits-`Date`- als auch ein defensiv bereits-`string`-Ergebnis ab).
 * `nachweis/**` importiert bereits `toIsoDateString` aus DIESER Datei (D3-
 * Präzedenz) — dieselbe Stelle ist der naheliegende Ort für die
 * `timestamptz`-Variante, statt eine neue `nachweis -> stammdaten`-
 * Abhängigkeit nur für eine generische pg-Treiber-Funktion einzuführen
 * (das wäre die FALSCHE Richtung — B10 kennt nur `stammdaten -> nachweis`).
 *
 * KRITISCH für den Export-Renderer (Determinismus): `nachweis.export.
 * erzeugt_at` wird bei der Erst-Erzeugung als ISO-STRING eingefügt, aber
 * von `pg` beim Lesen als `Date`-Objekt zurückgegeben — ein roher
 * `row.erzeugt_at`-Durchgriff würde bei der Download-Verifikation
 * `String(Date)` (lokale, menschsprachliche Datumsdarstellung) statt der
 * ISO-Form ins Metablatt rendern und DAMIT bei JEDEM Re-Render einen
 * ANDEREN Hash erzeugen — eine stille Determinismus-Verletzung.
 */
export function toIsoTimestampString(value: unknown): string {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw new Error(`toIsoTimestampString(): unerwarteter Wert-Typ (weder string noch Date): ${typeof value}`);
  }
  return new Date(value).toISOString();
}

export function toIsoTimestampStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return toIsoTimestampString(value);
}
