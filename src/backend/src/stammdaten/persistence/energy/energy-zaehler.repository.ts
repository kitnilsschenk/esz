import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../map-row';
import { decodeCursor } from '../cursor.util';

/** ADR-0008 §20 (D8) — query-basiertes Repository, NUR `energy.*`. KEIN `geraete_referenz` (§12, V0002-Abweichung a). */
export interface ZaehlerRow {
  readonly id: string;
  readonly system_id: string;
  readonly geraetetyp: string;
  readonly energietraeger: string;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export type Energietraeger = 'strom' | 'waerme' | 'kaelte' | 'gas' | 'oel' | 'biomasse';
export type BetriebsStatus = 'aktiv' | 'stillgelegt';

export interface Zaehler {
  readonly id: string;
  readonly systemId: string;
  readonly geraetetyp: string;
  readonly energietraeger: Energietraeger;
  readonly status: BetriebsStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Ein Zaehler MIT seinem Betriebszustand — nur die Liste liefert ihn.
 *
 * `angebunden` sagt, DASS ein Geraet aktiv zugeordnet ist, nicht welches:
 * weder DevEUI noch Blind-Index verlassen den Ingest-Pfad (§26.6).
 * `letzteUebertragung` ist der juengste Empfangszeitpunkt ueber alle Kanaele
 * des Zaehlers; `null` heisst „noch nie etwas empfangen".
 */
export interface ZaehlerMitBetrieb extends Zaehler {
  /** Name des Systems, an dem der Zähler hängt — die Liste zeigt ihn statt der bloßen Kennung. */
  readonly systemBezeichnung: string;
  readonly angebunden: boolean;
  readonly letzteUebertragung: string | null;
}

const ENERGIETRAEGER_WERTE: readonly Energietraeger[] = ['strom', 'waerme', 'kaelte', 'gas', 'oel', 'biomasse'];

function toEnergietraeger(value: string): Energietraeger {
  const match = ENERGIETRAEGER_WERTE.find((kandidat) => kandidat === value);
  return match ?? 'strom';
}

function toBetriebsStatus(value: string): BetriebsStatus {
  return value === 'stillgelegt' ? 'stillgelegt' : 'aktiv';
}

export interface ZaehlerListeRow extends ZaehlerRow {
  readonly system_bezeichnung: string;
  readonly angebunden: boolean;
  /** `timestamptz` — `pg` liefert ein `Date`; `null`, wenn nie etwas ankam. */
  readonly letzte_uebertragung: Date | string | null;
}

function mapListeRow(row: ZaehlerListeRow): ZaehlerMitBetrieb {
  return {
    ...mapRow(row),
    systemBezeichnung: row.system_bezeichnung,
    angebunden: row.angebunden,
    letzteUebertragung:
      row.letzte_uebertragung === null
        ? null
        : row.letzte_uebertragung instanceof Date
          ? row.letzte_uebertragung.toISOString()
          : row.letzte_uebertragung,
  };
}

function mapRow(row: ZaehlerRow): Zaehler {
  return {
    id: row.id,
    systemId: row.system_id,
    geraetetyp: row.geraetetyp,
    energietraeger: toEnergietraeger(row.energietraeger),
    status: toBetriebsStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = 'id, system_id, geraetetyp, energietraeger, status, created_at, updated_at';

/**
 * Zusatzspalten NUR fuer die Liste — `SELECT_COLUMNS` bleibt unangetastet,
 * weil `findById` und `updateGeraetetyp` (RETURNING) darauf laufen.
 *
 * **Warum die Liste diese beiden Angaben fuehrt.** Ohne sie beantwortete die
 * Zaehleruebersicht die zwei Fragen nicht, die beim Anschliessen zuerst
 * gestellt werden: Haengt an diesem Zaehler ueberhaupt ein Geraet, und kommt
 * von ihm etwas an? Beides stand bisher nur auf der Detailseite je Zaehler —
 * bei zwoelf Zaehlern zwoelf Klicks, um zu sehen, welcher stumm ist.
 *
 * Beide Angaben sind Betriebs-Metadaten ohne Personenbezug: ein Ja/Nein und
 * ein Zeitpunkt. Insbesondere NICHT die DevEUI und nicht der Blind-Index
 * (§26.6) — die Anbindung wird bejaht, nicht benannt.
 */
const LIST_SELECT_COLUMNS =
  'z.id, z.system_id, z.geraetetyp, z.energietraeger, z.status, z.created_at, z.updated_at, ' +
  // Der NAME des Systems, nicht nur seine Kennung: Eine Liste, in der
  // „System 77a6c17f" steht, zwingt zum Nachschlagen. Die Bezeichnung ist
  // kein Personenbezug und steht in der globalen Systemliste ohnehin
  // sichtbar.
  '(SELECT s.bezeichnung FROM energy.system s WHERE s.id = z.system_id) AS system_bezeichnung, ' +
  "EXISTS (SELECT 1 FROM device.geraet_zuordnung gz " +
  "         WHERE gz.zaehler_id = z.id AND gz.status = 'aktiv' AND gz.gueltig_bis IS NULL) AS angebunden, " +
  '(SELECT max(ks.letzter_ts) ' +
  '   FROM energy.messkanal mk ' +
  '   JOIN ingest.kanal_status ks ON ks.messkanal_key = mk.kanal_key ' +
  '  WHERE mk.zaehler_id = z.id) AS letzte_uebertragung';

export interface InsertZaehlerInput {
  readonly id: string;
  readonly systemId: string;
  readonly geraetetyp: string;
  readonly energietraeger: Energietraeger;
}

export interface ListZaehlerOptions {
  readonly cursor?: string;
  readonly limit: number;
  readonly systemId?: string;
}

@Injectable()
export class EnergyZaehlerRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertZaehlerInput): Promise<Zaehler> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO energy.zaehler (id, system_id, geraetetyp, energietraeger)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.systemId, input.geraetetyp, input.energietraeger],
    );

    const result = mapOneRow(bindRows<ZaehlerRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('energy.zaehler-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findById(id: string): Promise<Zaehler | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(`SELECT ${SELECT_COLUMNS} FROM energy.zaehler WHERE id = $1`, [
      id,
    ]);

    return mapOneRow(bindRows<ZaehlerRow>(rawRows), mapRow);
  }

  async listPage(options: ListZaehlerOptions): Promise<ZaehlerMitBetrieb[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.systemId !== undefined) {
      params.push(options.systemId);
      conditions.push(`z.system_id = $${String(params.length)}::uuid`);
    }

    const decoded = options.cursor !== undefined ? decodeCursor(options.cursor) : undefined;
    if (decoded !== undefined) {
      params.push(decoded.createdAt, decoded.id);
      const idxA = params.length - 1;
      const idxB = params.length;
      conditions.push(
        `(z.created_at > $${String(idxA)}::timestamptz OR (z.created_at = $${String(idxA)}::timestamptz AND z.id > $${String(idxB)}::uuid))`,
      );
    }

    params.push(options.limit + 1);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${LIST_SELECT_COLUMNS} FROM energy.zaehler z ${whereClause}
        ORDER BY z.created_at ASC, z.id ASC
        LIMIT $${String(params.length)}`,
      params,
    );

    return mapManyRows(bindRows<ZaehlerListeRow>(rawRows), mapListeRow);
  }

  async updateGeraetetyp(id: string, geraetetyp: string): Promise<Zaehler | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.zaehler SET geraetetyp = $2 WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
      [id, geraetetyp],
    );

    return mapOneRow(bindReturningRows<ZaehlerRow>(rawRows), mapRow);
  }

  /**
   * ADR-0005 §26.5 — Geraete-Zuordnungs-Shred-Kopplung (Aufrufer:
   * `EndkundeService.shredInTx`): liefert alle `energy.zaehler.id`
   * (logische Verweis-IDs, s. `device.geraet_zuordnung.zaehler_id`), die
   * ueber `energy.system.endkunde_id` zum uebergebenen Endkunden gehoeren.
   * JOIN bleibt VOLLSTAENDIG innerhalb `energy.*` (kein Namensraum-Bruch,
   * V0002 rote Linie 1/5) — der `device`-Namensraum wird hier NICHT
   * referenziert.
   */
  async listIdsByEndkundeId(endkundeId: string): Promise<readonly string[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT z.id FROM energy.zaehler z
        JOIN energy.system s ON s.id = z.system_id
        WHERE s.endkunde_id = $1`,
      [endkundeId],
    );

    return mapManyRows(bindRows<{ readonly id: string }>(rawRows), (row) => row.id);
  }

  /** IDEMPOTENT — kein Hard-Delete (Linie 3). */
  async stilllegen(id: string): Promise<Zaehler | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.zaehler SET status = 'stillgelegt'
        WHERE id = $1 AND status <> 'stillgelegt'
        RETURNING ${SELECT_COLUMNS}`,
      [id],
    );

    const updated = mapOneRow(bindReturningRows<ZaehlerRow>(rawRows), mapRow);
    if (updated !== undefined) {
      return updated;
    }

    return this.findById(id);
  }
}
