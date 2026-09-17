/**
 * `einfluss.*`-Repositories (ADR-0006 Teil B, B8/B10) — Datums-/Zeitstempel-
 * Normalisierung für den Roh-SQL-Pfad (`EntityManager.query()`).
 *
 * Mirrort BEWUSST `berechnung/persistence/pg-date.util.ts` (identischer,
 * empirisch verifizierter Finding aus jenem Modul: `pg`s Standard-Typ-Parser
 * für SQL-`date` (OID 1082) konstruiert das JS-`Date`-Objekt über den
 * Mehr-Argument-Konstruktor — LOKALE Mitternacht, NICHT UTC-Mitternacht; ein
 * naives `.toISOString().slice(0,10)` liefert je nach Prozess-Zeitzone einen
 * FALSCHEN Kalendertag). Bewusst DUPLIZIERT statt aus `berechnung/**`
 * importiert — dies ist ein generischer `pg`-Treiber-Fund ohne fachlichen
 * Bezug zu `berechnung`; eine `stammdaten -> berechnung`-Abhängigkeit nur für
 * diese Funktion wäre eine unnötige Kopplung (anders als die bereits
 * etablierte, bewusst MINIMALE `AnalyticsBerechnungslaufRepository`-
 * Wiederverwendung für ABAC, s. `StammdatenResourceAttributesProvider`-
 * Klassen-Dok). Ein künftiges Hoisting in eine gemeinsame `common/`-Utility
 * wäre die sauberere Lösung, ist aber NICHT Teil dieses Arbeitspakets.
 *
 * VERBINDLICHE REGEL für `stammdaten/persistence/einfluss/**`: JEDE SQL-
 * `date`-Spalte (`gueltig_ab_monat`/`gueltig_bis_monat`/`zeitraum_von`/
 * `zeitraum_bis`) MUSS durch `toIsoDateString()` — NICHT durch einen direkten
 * `row.spalte`-Durchgriff — in die kanonische `'YYYY-MM-DD'`-Repräsentation
 * überführt werden, JEDE `timestamptz`-Spalte (`art14_information_at`/
 * `erkannt_at`/`created_at`/`updated_at`) durch `toIsoTimestampString()`
 * bzw. `toIsoTimestampStringOrNull()`. Betrifft insbesondere den
 * `@AuditAction`-Kontext (`KontextIsScalarMapConstraint`, `audit-envelope.dto.ts`,
 * akzeptiert AUSSCHLIESSLICH `string`/`number`/`boolean`/`null` — ein rohes
 * `Date`-Objekt fällt durch) sowie jeden Datums-/Zeitraum-Vergleich im
 * `EinflussgroesseService` (Overlap-/RL-B1-/Art.-14-Prüfungen).
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
    // der `pg`-Konstruktion, liefert die URSPRÜNGLICHEN
    // Kalenderdatum-Komponenten zurück, unabhängig von der Prozess-Zeitzone.
    const jahr = String(value.getFullYear()).padStart(4, '0');
    const monat = String(value.getMonth() + 1).padStart(2, '0');
    const tag = String(value.getDate()).padStart(2, '0');
    return `${jahr}-${monat}-${tag}`;
  }

  throw new Error(`toIsoDateString(): unerwarteter Wert-Typ (weder string noch Date): ${typeof value}`);
}

export function toIsoDateStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return toIsoDateString(value);
}

/**
 * `timestamptz`-Spalten (OID 1184) trägt der Rohwert selbst einen Offset —
 * `pg` rechnet korrekt nach UTC um, das resultierende `Date`-Objekt ist
 * unzweideutig (anders als beim `date`-Fall oben). `new Date(value).
 * toISOString()` deckt sowohl ein bereits-`Date`- als auch ein (defensiv)
 * bereits-`string`-Ergebnis ab, analog `toIsoStringKontextWert()` in
 * `stammdaten/standort/zaehler-verortung.controller.ts`.
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
