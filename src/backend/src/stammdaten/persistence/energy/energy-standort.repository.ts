import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../map-row';
import type { Energietraeger, BetriebsStatus, Zaehler } from './energy-zaehler.repository';

/**
 * ADR-0010 (Standort-/Gebäudestruktur) — query-basiertes Repository, NUR
 * `energy.standort` (RL-1: VOLLSTÄNDIG PII-frei — keine Bezeichnung, keine
 * Adresse, kein Freitext, s. `migrations/V0017__standort_gebaeudestruktur.sql`).
 *
 * `pfad`/`ebene` sind AUSSCHLIESSLICH durch den DB-Trigger
 * `energy.standort_pfad_pflegen()` gepflegt (D6/O4) — dieses Repository
 * schickt bei INSERT/UPDATE niemals eigene Werte für diese Spalten, sondern
 * liest sie ausschließlich über `RETURNING` zurück.
 */
export interface StandortRow {
  readonly id: string;
  readonly endkunde_id: string;
  readonly parent_id: string | null;
  readonly typ: string;
  readonly pfad: string[];
  readonly ebene: number;
  readonly sortierung: number;
  readonly klimareferenz: string | null;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export const STANDORT_TYP_WERTE = ['liegenschaft', 'gebaeude', 'bauteil', 'etage', 'einheit', 'raum'] as const;
export type StandortTyp = (typeof STANDORT_TYP_WERTE)[number];

export type StandortStatus = 'aktiv' | 'stillgelegt';

export interface Standort {
  readonly id: string;
  readonly endkundeId: string;
  readonly parentId: string | null;
  readonly typ: StandortTyp;
  /** Vorfahrenkette INKLUSIVE eigener `id` (D6). */
  readonly pfad: readonly string[];
  readonly ebene: number;
  readonly sortierung: number;
  readonly klimareferenz: string | null;
  readonly status: StandortStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toStandortTyp(value: string): StandortTyp {
  const match = STANDORT_TYP_WERTE.find((kandidat) => kandidat === value);
  return match ?? 'raum';
}

function toStandortStatus(value: string): StandortStatus {
  return value === 'stillgelegt' ? 'stillgelegt' : 'aktiv';
}

function mapRow(row: StandortRow): Standort {
  return {
    id: row.id,
    endkundeId: row.endkunde_id,
    parentId: row.parent_id,
    typ: toStandortTyp(row.typ),
    pfad: row.pfad,
    ebene: row.ebene,
    sortierung: row.sortierung,
    klimareferenz: row.klimareferenz,
    status: toStandortStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, endkunde_id, parent_id, typ, pfad, ebene, sortierung, klimareferenz, status, created_at, updated_at';

export interface InsertStandortInput {
  readonly id: string;
  readonly endkundeId: string;
  readonly parentId: string | null;
  readonly typ: StandortTyp;
  readonly sortierung: number;
  /**
   * Klimastation dieses Standorts (ADR-0010). `null` = nicht festgelegt.
   *
   * Die Spalte gibt es seit V0002; schreibbar war sie bis 2026-09-16 NICHT —
   * die Station kam allein aus dem Lauf-Parameter. Wie teuer das ist, zeigt
   * ADR-0006 C10.1: Dort stand jahrelang eine Station 220 km neben dem
   * Objekt, und niemand konnte es sehen, weil es keinen Ort gab, an dem die
   * richtige Station hätte stehen können.
   */
  readonly klimareferenz: string | null;
}

export interface ListStandortOptions {
  readonly endkundeId: string;
  /** Subtree-Filter (D6): `pfad @> ARRAY[wurzelId]` — Wurzelknoten selbst inklusive. */
  readonly wurzelId?: string;
  /** Relative Tiefe ab dem (aufgelösten) Wurzelknoten bzw. absolut, falls kein `wurzelId`. */
  readonly maxTiefe?: number;
  readonly nurAktive?: boolean;
}

export interface StandortNachfahrenStatistik {
  /** Anzahl Nachfahren (OHNE den Knoten selbst) — bleibt bei einem reinen Reparent unverändert. */
  readonly anzahl: number;
  /** Höchste `ebene` unter den Nachfahren, `undefined` bei Blattknoten. */
  readonly maxEbene: number | undefined;
}

/**
 * PG-Fehlercode für ein generisches `RAISE EXCEPTION` OHNE explizites
 * `SQLSTATE` (Postgres-Default) — trifft hier auf die drei Trigger-Meldungen
 * in `energy.standort_pfad_pflegen()` zu (Parent existiert nicht, Zyklus,
 * Tiefenlimit, V0017). Der Service prüft diese drei Fälle bereits VORAB
 * (sprechende 400/409) — dieser Code ist NUR der Defense-in-Depth-Backstop
 * für ein enges Race-Fenster (s. V0017-Kommentar "Bekannte, dokumentierte
 * Vereinfachungen").
 */
export const PG_RAISE_EXCEPTION = 'P0001';
/** PG-Fehlercode für eine FK-Verletzung — Backstop für `fk_standort_parent_mandant` (D2.1). */
export const PG_FOREIGN_KEY_VIOLATION = '23503';

@Injectable()
export class EnergyStandortRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertStandortInput): Promise<Standort> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO energy.standort (id, endkunde_id, parent_id, typ, sortierung, klimareferenz)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.endkundeId, input.parentId, input.typ, input.sortierung, input.klimareferenz],
    );

    const result = mapOneRow(bindRows<StandortRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('energy.standort-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findById(id: string): Promise<Standort | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(`SELECT ${SELECT_COLUMNS} FROM energy.standort WHERE id = $1`, [
      id,
    ]);

    return mapOneRow(bindRows<StandortRow>(rawRows), mapRow);
  }

  /**
   * Mandantengefilterter Batch-Lookup (`POST .../standorte/labels`,
   * `read:standort_pii`, ADR-0010 §5): liefert NUR die angeforderten
   * `ids`, die TATSÄCHLICH zu `endkundeId` gehören — Ids, die nicht
   * existieren oder einem ANDEREN Endkunden gehören, werden im Ergebnis
   * still weggelassen (Batch-"Best effort", s. `StandortLabelService`).
   */
  async findManyByIdsAndEndkunde(ids: readonly string[], endkundeId: string): Promise<Standort[]> {
    if (ids.length === 0) {
      return [];
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.standort WHERE id = ANY($1::uuid[]) AND endkunde_id = $2`,
      [ids, endkundeId],
    );

    return mapManyRows(bindRows<StandortRow>(rawRows), mapRow);
  }

  /**
   * Baum-/Struktur-Liste (`read:standort`, ADR-0010 §5) — bewusst KEINE
   * Pagination (die ADR-API-Skizze kennt für diese Route weder `cursor` noch
   * `limit`, das harte Tiefenlimit `ck_standort_ebene` (0-9) begrenzt die
   * Knotenzahl je Endkunde ohnehin strukturell). Reine `energy`-Query — KEIN
   * `identity`-Zugriff (kritischer Punkt des Arbeitsauftrags: die
   * Baum-Struktur muss ohne jede PII-Berechtigung nutzbar bleiben).
   */
  async listByEndkunde(options: ListStandortOptions): Promise<Standort[]> {
    const conditions: string[] = ['endkunde_id = $1'];
    const params: unknown[] = [options.endkundeId];

    if (options.nurAktive === true) {
      conditions.push("status = 'aktiv'");
    }

    let wurzelEbene: number | undefined;
    if (options.wurzelId !== undefined) {
      params.push(options.wurzelId);
      conditions.push(`pfad @> ARRAY[$${String(params.length)}]::uuid[]`);

      const wurzel = await this.findById(options.wurzelId);
      wurzelEbene = wurzel?.ebene;
    }

    if (options.maxTiefe !== undefined) {
      const basis = wurzelEbene ?? 0;
      params.push(basis + options.maxTiefe);
      conditions.push(`ebene <= $${String(params.length)}`);
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.standort
        WHERE ${conditions.join(' AND ')}
        ORDER BY ebene ASC, sortierung ASC, created_at ASC`,
      params,
    );

    return mapManyRows(bindRows<StandortRow>(rawRows), mapRow);
  }

  /** Nur DIREKTE, aktive Kinder — Stilllegen-Vorbedingung D2.6(a). */
  async hatAktiveKinder(id: string): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT EXISTS (SELECT 1 FROM energy.standort WHERE parent_id = $1 AND status = 'aktiv') AS vorhanden`,
      [id],
    );
    const row = mapOneRow(bindRows<{ readonly vorhanden: boolean }>(rawRows), (r) => r.vorhanden);
    return row ?? false;
  }

  /** JEDES Kind, unabhängig vom Status — Hart-Löschen-Vorbedingung D2.6 ("nur Blattknoten"). */
  async hatKinder(id: string): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT EXISTS (SELECT 1 FROM energy.standort WHERE parent_id = $1) AS vorhanden`,
      [id],
    );
    const row = mapOneRow(bindRows<{ readonly vorhanden: boolean }>(rawRows), (r) => r.vorhanden);
    return row ?? false;
  }

  /**
   * Statistik über die Nachfahren EINES Knotens (ohne ihn selbst) — Basis für
   * (a) den Tiefenlimit-Vorab-Check beim Verschieben (D2.3/D6, spiegelt die
   * Trigger-Prüfung `energy.standort_pfad_pflegen()` Schritt 3, damit der
   * Service eine sprechende 409/400 liefern kann statt eines rohen
   * Trigger-`RAISE EXCEPTION`) und (b) `kontext.nachfahren_anzahl`
   * (`standort.stammdaten.verschoben`, ADR-0010 §5 Response
   * `nachfahrenAktualisiert`). Ein reines Reparent ändert die Nachfahren-
   * MENGE nicht (nur `pfad`/`ebene` der Zeilen) — die Statistik VOR dem
   * Verschieben ist daher identisch zu der NACH dem Verschieben.
   */
  async findNachfahrenStatistik(id: string): Promise<StandortNachfahrenStatistik> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT count(*)::int AS anzahl, max(ebene) AS max_ebene
         FROM energy.standort
        WHERE pfad @> ARRAY[$1]::uuid[] AND id <> $1`,
      [id],
    );

    const row = mapOneRow(bindRows<{ readonly anzahl: number; readonly max_ebene: number | null }>(rawRows), (r) => r);
    return { anzahl: row?.anzahl ?? 0, maxEbene: row?.max_ebene ?? undefined };
  }

  async updateStruktur(
    id: string,
    input: { readonly typ?: StandortTyp; readonly sortierung?: number; readonly klimareferenz?: string | null },
  ): Promise<Standort | undefined> {
    const setzungen: string[] = [];
    const werte: unknown[] = [];
    let index = 1;

    if (input.typ !== undefined) {
      setzungen.push(`typ = $${String(index)}`);
      werte.push(input.typ);
      index += 1;
    }
    if (input.sortierung !== undefined) {
      setzungen.push(`sortierung = $${String(index)}`);
      werte.push(input.sortierung);
      index += 1;
    }
    // `null` ist hier ein GÜLTIGER Wert („Station wieder entfernen"), nur
    // `undefined` heisst „nicht anfassen" — deshalb der Vergleich gegen
    // undefined und nicht die Kurzform.
    if (input.klimareferenz !== undefined) {
      setzungen.push(`klimareferenz = $${String(index)}`);
      werte.push(input.klimareferenz);
      index += 1;
    }

    if (setzungen.length === 0) {
      return this.findById(id);
    }

    werte.push(id);
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.standort SET ${setzungen.join(', ')}
        WHERE id = $${String(index)}
        RETURNING ${SELECT_COLUMNS}`,
      werte,
    );

    return mapOneRow(bindReturningRows<StandortRow>(rawRows), mapRow);
  }

  /** Reparent (D6) — `pfad`/`ebene` werden ausschließlich vom Trigger neu berechnet. */
  async updateParent(id: string, neuerParentId: string | null): Promise<Standort | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.standort SET parent_id = $2 WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
      [id, neuerParentId],
    );

    return mapOneRow(bindReturningRows<StandortRow>(rawRows), mapRow);
  }

  /** IDEMPOTENT — Stilllegung (kein Hard-Delete, D2.6), analog `EnergyZaehlerRepository.stilllegen`. */
  async stilllegen(id: string): Promise<Standort | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE energy.standort SET status = 'stillgelegt'
        WHERE id = $1 AND status <> 'stillgelegt'
        RETURNING ${SELECT_COLUMNS}`,
      [id],
    );

    const updated = mapOneRow(bindReturningRows<StandortRow>(rawRows), mapRow);
    if (updated !== undefined) {
      return updated;
    }

    return this.findById(id);
  }

  /** Hartes DELETE (D2.6, "Korrektur von Fehlanlagen") — NUR nach Service-seitiger Vorbedingungsprüfung. */
  async deleteById(id: string): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `DELETE FROM energy.standort WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
      [id],
    );
    const deleted = mapOneRow(bindReturningRows<StandortRow>(rawRows), mapRow);
    return deleted !== undefined;
  }

  /**
   * Kern-Query (ADR-0010 D6, wörtlich): "alle Zähler unter Knoten X zum
   * Stichtag T" — vollständig in `energy`, OHNE Join nach `identity`. Diese
   * Query trägt später jede Auswertung (Baseline/Einsparung je Gebäude/
   * Einheit).
   */
  async findZaehlerUnterKnoten(input: {
    readonly knotenId: string;
    readonly stichtag: string;
    readonly inklusiveUnterknoten: boolean;
  }): Promise<Zaehler[]> {
    const standortPraedikat = input.inklusiveUnterknoten ? 's.pfad @> ARRAY[$1]::uuid[]' : 's.id = $1';

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT z.id, z.system_id, z.geraetetyp, z.energietraeger, z.status, z.created_at, z.updated_at
         FROM energy.standort s
         JOIN energy.zaehler_standort zs ON zs.standort_id = s.id
          AND tstzrange(zs.gueltig_von, zs.gueltig_bis) @> $2::timestamptz
         JOIN energy.zaehler z ON z.id = zs.zaehler_id
        WHERE ${standortPraedikat}
        ORDER BY z.created_at ASC, z.id ASC`,
      [input.knotenId, input.stichtag],
    );

    return mapManyRows(bindRows<ZaehlerUnterKnotenRow>(rawRows), mapZaehlerUnterKnotenRow);
  }
}

/** Ergebniszeile der Kern-Query — 1:1 zur `energy.zaehler`-Projektion (PII-frei, KEIN `geraete_referenz`, §12). */
interface ZaehlerUnterKnotenRow {
  readonly id: string;
  readonly system_id: string;
  readonly geraetetyp: string;
  readonly energietraeger: string;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

const ENERGIETRAEGER_WERTE: readonly Energietraeger[] = ['strom', 'waerme', 'kaelte', 'gas', 'oel', 'biomasse'];

function toEnergietraegerLokal(value: string): Energietraeger {
  const match = ENERGIETRAEGER_WERTE.find((kandidat) => kandidat === value);
  return match ?? 'strom';
}

function toBetriebsStatusLokal(value: string): BetriebsStatus {
  return value === 'stillgelegt' ? 'stillgelegt' : 'aktiv';
}

function mapZaehlerUnterKnotenRow(row: ZaehlerUnterKnotenRow): Zaehler {
  return {
    id: row.id,
    systemId: row.system_id,
    geraetetyp: row.geraetetyp,
    energietraeger: toEnergietraegerLokal(row.energietraeger),
    status: toBetriebsStatusLokal(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
