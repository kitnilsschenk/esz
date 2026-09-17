/**
 * ADR-0008 §20 (D8, `backend-lead`-Votum 8, A6) — verbindlicher
 * mapRow-Konventions-Helfer: die Zeilen→DTO-Bindung läuft je Repository über
 * EINE typisierte Mapper-Funktion je `RowType` (kein ad-hoc-Mapping pro
 * Query, kein `any`-Durchsickern — analog zum bereits etablierten Muster in
 * `audit/audit.service.ts`).
 *
 * Jedes Repository definiert:
 *   - ein `interface XyzRow { readonly spalte_a: string; ... }` (1:1 zur
 *     `SELECT`-Projektion, snake_case wie die DB-Spalten),
 *   - eine `function mapXyzRow(row: XyzRow): XyzEntity` (camelCase-DTO),
 * und bindet `EntityManager.query<XyzRow[]>(...)`-Ergebnisse AUSSCHLIESSLICH
 * über `mapOneRow`/`mapManyRows` unten.
 */
export type RowMapper<Row, T> = (row: Row) => T;

export function mapOneRow<Row, T>(rows: readonly Row[], mapper: RowMapper<Row, T>): T | undefined {
  const row = rows[0];
  return row === undefined ? undefined : mapper(row);
}

export function mapManyRows<Row, T>(rows: readonly Row[], mapper: RowMapper<Row, T>): T[] {
  return rows.map(mapper);
}

/**
 * `EntityManager.query(...)` ist bei TypeORM (roh-SQL-Pfad) mit `any`
 * typisiert (s. `audit/audit.service.ts`-Kommentar). Diese Funktion ist die
 * EINZIGE Stelle je Repository-Aufruf, an der das Ergebnis explizit auf
 * `Row[]` gebunden wird — kein `any`-Durchsickern in Aufrufer-Code.
 *
 * NUR für SELECT/INSERT ... RETURNING verwenden — s. `bindReturningRows()`
 * für UPDATE/DELETE ... RETURNING (TypeORM liefert dort eine ANDERE Form).
 */
export function bindRows<Row>(rawRows: unknown): Row[] {
  return rawRows as Row[];
}

/**
 * KRITISCH (Finding, empirisch verifiziert gegen Testcontainer-PG):
 * `PostgresQueryRunner.query()` (TypeORM, `driver/postgres/
 * PostgresQueryRunner.js`) liefert `result.raw` — für die Befehle `UPDATE`
 * und `DELETE` ist das ein TUPEL `[rows, rowCount]`, NICHT die Zeilen
 * direkt (nur `SELECT`/`INSERT` fallen in den `default`-Zweig, der `raw.rows`
 * direkt liefert). `EntityManager.query()` reicht IMMER `result.raw` durch
 * (kein `useStructuredResult`-Zugriff über die EntityManager-Fassade) —
 * JEDES `UPDATE ... RETURNING`/`DELETE ... RETURNING`-Repository-Query MUSS
 * daher `bindReturningRows()` statt `bindRows()` verwenden, sonst wird das
 * Zeilen-Array selbst fälschlich als EINZELNE "Zeile" interpretiert (leere
 * Felder, stiller Datenverlust in der Response — s. Regressionstest).
 */
export function bindReturningRows<Row>(rawRows: unknown): Row[] {
  if (Array.isArray(rawRows) && rawRows.length === 2 && Array.isArray(rawRows[0]) && typeof rawRows[1] === 'number') {
    return rawRows[0] as Row[];
  }
  // Defensive Rückfalloption (z. B. ein Treiber/eine TypeORM-Version, die
  // bereits direkt die Zeilen liefert) — im Regelfall greift der Zweig oben.
  return rawRows as Row[];
}
