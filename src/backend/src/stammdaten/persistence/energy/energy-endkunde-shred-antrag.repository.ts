import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../map-row';
import { decodeCursor } from '../cursor.util';

/**
 * ADR-0009 §2.1/§2.6 — query-basiertes Repository für
 * `energy.endkunde_shred_antrag` (`migrations/V0008__create_endkunde_shred_antrag.sql`),
 * NUR `energy.*` (Namensraum-Trennung, Linie 5). Kapselt den Vier-Augen-/
 * Freigabe-Workflow für Krypto-Shredding (Art. 17 DSGVO, Folgeauftrag aus
 * ADR-0008 §29(C4)).
 *
 * TOCTOU-Schutz (ADR-0009 §2.1/§6, technical-director-Constraint): `freigeben()`/
 * `ablehnen()`/`markAusgefuehrt()` sind bedingte `UPDATE ... WHERE status=$x`-
 * Anweisungen mit `RETURNING` — die PDP-Statusprüfung (`InCodePolicyAdapter`,
 * ADR-0009 §2.2) ist eine Autorisierungsentscheidung auf einem ZUVOR
 * gelesenen Snapshot, NICHT die transaktionale Autorität über den
 * Zustandsübergang selbst. Liefert `UPDATE` 0 Zeilen (via
 * `bindReturningRows()` — RETURNING-Zeilenform unterscheidet sich von
 * SELECT/INSERT, s. dortigen Kommentar), ist das der bindende Beweis für
 * einen bereits anderweitig entschiedenen/abgelaufenen Antrag (409, Service-
 * Verantwortung) — KEIN stiller Idempotenz-Fallback wie bei `sperren()`/
 * `stilllegen()` (ein zweiter Freigabe-/Ablehnungsversuch ist ein ECHTER
 * Konflikt, kein harmloser Wiederholungsfall).
 */
export type ShredAntragStatus = 'beantragt' | 'freigegeben' | 'abgelehnt' | 'ausgefuehrt' | 'abgelaufen';

export interface ShredAntragRow {
  readonly id: string;
  readonly endkunde_id: string;
  readonly grund: string;
  readonly beantragt_von_sub: string;
  readonly beantragt_am: string;
  readonly freigeber_sub: string | null;
  readonly entschieden_am: string | null;
  readonly status: string;
  readonly ablehnungsgrund: string | null;
  readonly gueltig_bis: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ShredAntrag {
  readonly id: string;
  readonly endkundeId: string;
  readonly grund: string;
  readonly beantragtVonSub: string;
  readonly beantragtAm: string;
  readonly freigeberSub: string | null;
  readonly entschiedenAm: string | null;
  readonly status: ShredAntragStatus;
  readonly ablehnungsgrund: string | null;
  readonly gueltigBis: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const STATUS_WERTE: readonly ShredAntragStatus[] = ['beantragt', 'freigegeben', 'abgelehnt', 'ausgefuehrt', 'abgelaufen'];

function toStatus(value: string): ShredAntragStatus {
  const match = STATUS_WERTE.find((kandidat) => kandidat === value);
  return match ?? 'beantragt';
}

function mapRow(row: ShredAntragRow): ShredAntrag {
  return {
    id: row.id,
    endkundeId: row.endkunde_id,
    grund: row.grund,
    beantragtVonSub: row.beantragt_von_sub,
    beantragtAm: row.beantragt_am,
    freigeberSub: row.freigeber_sub,
    entschiedenAm: row.entschieden_am,
    status: toStatus(row.status),
    ablehnungsgrund: row.ablehnungsgrund,
    gueltigBis: row.gueltig_bis,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, endkunde_id, grund, beantragt_von_sub, beantragt_am, freigeber_sub, entschieden_am, ' +
  'status, ablehnungsgrund, gueltig_bis, created_at, updated_at';

/** PG-Fehlercode für UNIQUE-Verletzung (Race-Restfenster hinter dem Vorab-Check, ADR-0009 §2.1/§6). */
export const PG_UNIQUE_VIOLATION = '23505';

export interface InsertShredAntragInput {
  readonly id: string;
  readonly endkundeId: string;
  readonly grund: string;
  readonly beantragtVonSub: string;
  readonly gueltigBis: string;
}

export interface ListShredAntragOptions {
  readonly endkundeId: string;
  readonly cursor?: string;
  readonly limit: number;
}

@Injectable()
export class EnergyEndkundeShredAntragRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertShredAntragInput): Promise<ShredAntrag> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO energy.endkunde_shred_antrag (id, endkunde_id, grund, beantragt_von_sub, gueltig_bis)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.endkundeId, input.grund, input.beantragtVonSub, input.gueltigBis],
    );

    const result = mapOneRow(bindRows<ShredAntragRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('energy.endkunde_shred_antrag-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findById(id: string): Promise<ShredAntrag | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.endkunde_shred_antrag WHERE id = $1`,
      [id],
    );

    return mapOneRow(bindRows<ShredAntragRow>(rawRows), mapRow);
  }

  /** Höchstens EIN Treffer je Endkunde möglich (Pflicht-Unique-Index, ADR-0009 §2.1/§5). */
  async findOffenByEndkunde(endkundeId: string): Promise<ShredAntrag | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.endkunde_shred_antrag WHERE endkunde_id = $1 AND status = 'beantragt'`,
      [endkundeId],
    );

    return mapOneRow(bindRows<ShredAntragRow>(rawRows), mapRow);
  }

  async listPage(options: ListShredAntragOptions): Promise<ShredAntrag[]> {
    const conditions: string[] = ['endkunde_id = $1'];
    const params: unknown[] = [options.endkundeId];

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

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.endkunde_shred_antrag WHERE ${conditions.join(' AND ')}
        ORDER BY created_at ASC, id ASC
        LIMIT $${String(params.length)}`,
      params,
    );

    return mapManyRows(bindRows<ShredAntragRow>(rawRows), mapRow);
  }

  /**
   * ADR-0009 §2.2/§6 — Freigabe durch die ZWEITE Person. TOCTOU-Schutz s.
   * Klassen-Dok: 0 Zeilen (`undefined`) = Antrag ist NICHT mehr im Status
   * `beantragt` (bereits anderweitig entschieden/abgelaufen) — der Service
   * wirft dafür 409, KEIN stiller Fallback.
   */
  async freigeben(antragId: string, freigeberSub: string): Promise<ShredAntrag | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.endkunde_shred_antrag
          SET status = 'freigegeben', freigeber_sub = $2, entschieden_am = now()
        WHERE id = $1 AND status = 'beantragt'
        RETURNING ${SELECT_COLUMNS}`,
      [antragId, freigeberSub],
    );

    return mapOneRow(bindReturningRows<ShredAntragRow>(rawRows), mapRow);
  }

  /**
   * ADR-0009 §2.1 — schließt den in EINER Transaktion mit `freigeben()`
   * gekoppelten Freigeben+Ausführen-Fluss ab (Impl.-Entscheidung dieser ADR,
   * s. §2.1 "keine zeitlich entkoppelte Ausführen-Stufe"). Erwartet
   * strukturell IMMER genau die Zeile, die dieselbe Transaktion soeben selbst
   * auf `freigegeben` gesetzt hat — 0 Zeilen hier wäre ein interner
   * Kontraktbruch (Service wirft einen generischen 500er, kein Fach-409).
   */
  async markAusgefuehrt(antragId: string): Promise<ShredAntrag | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.endkunde_shred_antrag
          SET status = 'ausgefuehrt'
        WHERE id = $1 AND status = 'freigegeben'
        RETURNING ${SELECT_COLUMNS}`,
      [antragId],
    );

    return mapOneRow(bindReturningRows<ShredAntragRow>(rawRows), mapRow);
  }

  /**
   * ADR-0009 §2.1/§2.2 — Ablehnung durch die ZWEITE Person, terminal (der
   * Antragsteller kann danach erneut beantragen). Gleicher TOCTOU-Schutz wie
   * `freigeben()`.
   */
  async ablehnen(antragId: string, freigeberSub: string, ablehnungsgrund: string): Promise<ShredAntrag | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.endkunde_shred_antrag
          SET status = 'abgelehnt', freigeber_sub = $2, entschieden_am = now(), ablehnungsgrund = $3
        WHERE id = $1 AND status = 'beantragt'
        RETURNING ${SELECT_COLUMNS}`,
      [antragId, freigeberSub, ablehnungsgrund],
    );

    return mapOneRow(bindReturningRows<ShredAntragRow>(rawRows), mapRow);
  }
}
