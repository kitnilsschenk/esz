import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../map-row';
import { decodeCursor } from '../cursor.util';
import type { VerarbeitungsStatus } from './energy-endkunde.repository';

/** ADR-0008 §20 (D8) — query-basiertes Repository, NUR `energy.*` (DS-07-Datensubjekt-Pseudonym). */
export interface AnschlussnutzerRow {
  readonly id: string;
  readonly endkunde_id: string;
  readonly verarbeitungs_status: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly einschraenkung_grund_code?: string | null;
  readonly gesperrt_seit?: string | null;
  readonly neuerhebung_fortsetzen?: boolean | null;
}

export interface Anschlussnutzer {
  readonly id: string;
  readonly endkundeId: string;
  readonly verarbeitungsStatus: VerarbeitungsStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * Art.-18-Grund (V0024, geschlossene Liste per
   * `ck_anschlussnutzer_einschraenkung_grund_code`). Existiert per
   * `ck_anschlussnutzer_einschraenkung_kohaerenz` AUSSCHLIESSLICH bei
   * `verarbeitungsStatus === 'gesperrt'`.
   */
  readonly einschraenkungGrundCode?: string | null;
  readonly gesperrtSeit?: string | null;
  /**
   * Auflage C-8 (V0087) — bei Sperrgrund lit. b / lit. d die ausdrueckliche
   * Entscheidung, ob WEITER ERHOBEN wird; sonst `null`. Das Ingest-Gate liest
   * genau diese Spalte. Optional wie die beiden Felder darueber, aus
   * demselben Grund (Test-Fixtures ohne Spread-Basis); `mapRow()` liefert sie
   * an der Laufzeit-Zeile immer als `boolean | null`.
   */
  readonly neuerhebungFortsetzen?: boolean | null;
}

/**
 * FAIL-CLOSED (Review-Fund 2026-08-26, V0029) — identisches Problem und
 * identische Behandlung wie in `energy-endkunde.repository.ts`, s. dortige
 * Begruendung. Beim Anschlussnutzer wiegt es sogar schwerer: seine Sperre ist
 * der Gegenstand von ADR-0006 P4 / ADR-0007 A12 (Rohdaten-Export), und dort
 * gibt es bis heute KEINEN DB-Trigger-Backstop — die Auswertung ist reiner
 * App-Scope. Eine stille Abbildung auf `'aktiv'` waere hier die einzige
 * Fehlerquelle ohne zweite Linie gewesen.
 *
 * Seit V0029 deckt `ck_anschlussnutzer_verarbeitungs_status` die Ursache in
 * der DB ab; dieser Wurf bleibt die unabhaengige zweite Linie.
 *
 * Exportiert (ADR-0006 P4/ADR-0007 A12, `AnalyticsLaufLookupRepository.
 * findAnschlussnutzerSperrenFuerPaar()`) — DIESELBE Zeile, DIESELBE
 * Fail-closed-Begruendung gilt dort 1:1 fuer denselben DB-Wert; ein zweiter,
 * unabhaengig gepflegter Mapper waere genau die Divergenzgefahr, die dieser
 * Kommentar selbst an anderer Stelle (energy-endkunde.repository.ts) kritisiert.
 */
export function toVerarbeitungsStatus(value: string): VerarbeitungsStatus {
  if (value === 'aktiv' || value === 'gesperrt' || value === 'geloescht') {
    return value;
  }
  throw new Error(
    `energy.anschlussnutzer.verarbeitungs_status traegt den unbekannten Wert '${value}' — ` +
      'Schema-Verletzung (ck_anschlussnutzer_verarbeitungs_status, V0029). Fail-closed statt ' +
      "stiller Abbildung auf 'aktiv', weil diese Spalte die Art.-18-Sperre traegt (P4/A12).",
  );
}

function mapRow(row: AnschlussnutzerRow): Anschlussnutzer {
  return {
    id: row.id,
    endkundeId: row.endkunde_id,
    verarbeitungsStatus: toVerarbeitungsStatus(row.verarbeitungs_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    einschraenkungGrundCode: row.einschraenkung_grund_code ?? null,
    gesperrtSeit: row.gesperrt_seit ?? null,
    neuerhebungFortsetzen: row.neuerhebung_fortsetzen ?? null,
  };
}

const SELECT_COLUMNS =
  'id, endkunde_id, verarbeitungs_status, created_at, updated_at, einschraenkung_grund_code, gesperrt_seit, neuerhebung_fortsetzen';

export interface ListAnschlussnutzerOptions {
  readonly cursor?: string;
  readonly limit: number;
  readonly endkundeId?: string;
}

@Injectable()
export class EnergyAnschlussnutzerRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: { readonly id: string; readonly endkundeId: string }): Promise<Anschlussnutzer> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO energy.anschlussnutzer (id, endkunde_id) VALUES ($1, $2) RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.endkundeId],
    );

    const result = mapOneRow(bindRows<AnschlussnutzerRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('energy.anschlussnutzer-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findById(id: string): Promise<Anschlussnutzer | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.anschlussnutzer WHERE id = $1`,
      [id],
    );

    return mapOneRow(bindRows<AnschlussnutzerRow>(rawRows), mapRow);
  }

  /**
   * Art.-18-Sperre MIT Pflicht-Grund (ADR-0007 A11.1/A11.3/A11.6) — wortgleiche
   * Semantik zu `EnergyEndkundeRepository.markGesperrt()`.
   *
   * Grund und `gesperrt_seit` gemeinsam in EINEM Statement: der
   * Kohaerenz-CHECK `ck_anschlussnutzer_einschraenkung_kohaerenz` (V0024)
   * laesst beide nur zusammen zu. Zeitstempel serverseitig `now()`, kein
   * Aufrufer-Wert (A11.3: kein Rueckdatieren).
   *
   * Der `WHERE ... = 'aktiv'`-Guard ist die Garantie, dass ein bereits
   * gesetzter Grund hier NIEMALS ueberschrieben wird (A11.2). Ein Nicht-Treffer
   * ist KEIN stiller Idempotenz-Fall — der Aufrufer
   * (`AnschlussnutzerService.sperren()`) hat den Vorzustand gelesen und
   * entschieden (`entscheideSperre()`); `undefined` heisst hier nur
   * „nicht (mehr) `aktiv`" und ist dort abschliessend behandelt.
   */
  async markGesperrt(
    id: string,
    grund: string,
    neuerhebungFortsetzen: boolean | null,
  ): Promise<Anschlussnutzer | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.anschlussnutzer
          SET verarbeitungs_status = 'gesperrt',
              einschraenkung_grund_code = $2,
              gesperrt_seit = now(),
              -- Auflage C-8: im SELBEN Statement wie der Grund. Der CHECK
              -- ck_*_neuerhebung_entschieden (V0087) laesst bei lit. b/d
              -- nichts anderes zu -- und genau so soll es sein: Grund und
              -- Erhebungs-Entscheidung sind EIN Vorgang, kein Nachtrag.
              neuerhebung_fortsetzen = $3
        WHERE id = $1 AND verarbeitungs_status = 'aktiv'
        RETURNING ${SELECT_COLUMNS}`,
      [id, grund, neuerhebungFortsetzen],
    );

    // `bindReturningRows`, NICHT `bindRows`: TypeORM liefert fuer UPDATE das
    // Tupel `[rows, rowCount]` (s. `map-row.ts`) — mit `bindRows` wuerde das
    // Zeilen-Array als EINZELNE Zeile gelesen und die Antwort still
    // leerlaufen. `insert()` oben darf `bindRows` verwenden, weil INSERT in
    // den `default`-Zweig faellt und die Zeilen direkt liefert.
    return mapOneRow(bindReturningRows<AnschlussnutzerRow>(rawRows), mapRow);
  }

  /**
   * Aufhebung der Art.-18-Einschraenkung (ADR-0007 A11.7/A11.10).
   *
   * Status, Grund UND `gesperrt_seit` werden in EINEM Statement
   * zurueckgesetzt — der Kohaerenz-CHECK `ck_anschlussnutzer_einschraenkung_kohaerenz` (V0024) laesst nichts anderes
   * zu: Grund gesetzt ERZWINGT `verarbeitungs_status='gesperrt'`. Wer nur den
   * Status aendert, laeuft in einen Constraint-Fehler; wer den CHECK dafuer
   * lockert, hebelt genau die Garantie aus, die den Grund an die
   * Einschraenkung bindet.
   *
   * Der `WHERE ... = 'gesperrt'`-Guard haelt die Richtung fest: NUR
   * `gesperrt -> aktiv`. `undefined` heisst „war nicht (mehr) gesperrt" und
   * wird vom Aufrufer entschieden (`entscheideAufhebung()`), nicht hier still
   * quittiert.
   *
   * FOLGE, die bewusst in Kauf genommen wird: nach diesem UPDATE ist in
   * `energy.anschlussnutzer` KEINE Spur des Art.-18-Vorgangs mehr vorhanden. Die
   * Spalte ist fluechtiger Zustand, nicht Historie — deshalb tragen die
   * Audit-Zeile (V0036) und `energy.einschraenkung_unterrichtung` (V0035) den
   * Nachweis.
   */
  async markEntsperrt(id: string): Promise<Anschlussnutzer | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.anschlussnutzer
          SET verarbeitungs_status = 'aktiv',
              einschraenkung_grund_code = NULL,
              gesperrt_seit = NULL,
              -- C-8: mit dem Grund verschwindet die Entscheidung. Sie gehoert
              -- zu GENAU DIESER Einschraenkung; ein stehengebliebenes false
              -- wuerde die naechste Sperre mit einem Wert vorbelegen, den
              -- niemand fuer sie getroffen hat (Lehre aus Regression G-1).
              neuerhebung_fortsetzen = NULL
        WHERE id = $1 AND verarbeitungs_status = 'gesperrt'
        RETURNING ${SELECT_COLUMNS}`,
      [id],
    );

    return mapOneRow(bindReturningRows<AnschlussnutzerRow>(rawRows), mapRow);
  }

  async listPage(options: ListAnschlussnutzerOptions): Promise<Anschlussnutzer[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.endkundeId !== undefined) {
      params.push(options.endkundeId);
      conditions.push(`endkunde_id = $${String(params.length)}::uuid`);
    }

    const decoded = options.cursor !== undefined ? decodeCursor(options.cursor) : undefined;
    if (decoded !== undefined) {
      params.push(decoded.createdAt, decoded.id);
      const idxA = params.length - 1;
      const idxB = params.length;
      conditions.push(
        `(created_at > $${String(idxA)}::timestamptz OR (created_at = $${String(idxA)}::timestamptz AND id > $${String(idxB)}::uuid))`,
      );
    }

    params.push(options.limit + 1);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.anschlussnutzer ${whereClause}
        ORDER BY created_at ASC, id ASC
        LIMIT $${String(params.length)}`,
      params,
    );

    return mapManyRows(bindRows<AnschlussnutzerRow>(rawRows), mapRow);
  }
}
