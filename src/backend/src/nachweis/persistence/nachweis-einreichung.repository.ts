import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import { toIsoDateString, toIsoTimestampString } from '../../berechnung/persistence/pg-date.util';

export type EinreichungArt = 'verwendungsnachweis' | 'zwischennachweis' | 'anfrage_bafa' | 'stichprobe';
export type EinreichungUebermittlungsweg = 'bscw_manuell' | 'email_geschuetzt' | 'api';

export interface Einreichung {
  readonly id: string;
  readonly exportId: string;
  readonly einsparlaufId: string;
  readonly art: EinreichungArt;
  readonly anfrageRef: string | null;
  readonly empfaenger: string;
  readonly uebermittlungsweg: EinreichungUebermittlungsweg;
  readonly manifestHash: Buffer;
  readonly uebermitteltAt: string;
  readonly eingereichtVonSub: string;
  readonly belegRef: string | null;
  readonly ersetztEinreichungId: string | null;
  readonly korrekturGrundCode: string | null;
  readonly createdAt: string;
}

interface EinreichungDbRow {
  readonly id: string;
  readonly export_id: string;
  readonly einsparlauf_id: string;
  readonly art: string;
  readonly anfrage_ref: string | null;
  readonly empfaenger: string;
  readonly uebermittlungsweg: string;
  readonly manifest_hash: Buffer;
  /** `timestamptz` — `pg` liefert zur Laufzeit ein `Date`-Objekt (s. `toIsoTimestampString()`-Import, Muster `nachweis-export.repository.ts`). */
  readonly uebermittelt_at: unknown;
  readonly eingereicht_von_sub: string;
  readonly beleg_ref: string | null;
  readonly ersetzt_einreichung_id: string | null;
  readonly korrektur_grund_code: string | null;
  readonly created_at: unknown;
}

function toArt(value: string): EinreichungArt {
  return value === 'zwischennachweis' || value === 'anfrage_bafa' || value === 'stichprobe' ? value : 'verwendungsnachweis';
}
function toWeg(value: string): EinreichungUebermittlungsweg {
  return value === 'email_geschuetzt' || value === 'api' ? value : 'bscw_manuell';
}

function mapEinreichungRow(row: EinreichungDbRow): Einreichung {
  return {
    id: row.id,
    exportId: row.export_id,
    einsparlaufId: row.einsparlauf_id,
    art: toArt(row.art),
    anfrageRef: row.anfrage_ref,
    empfaenger: row.empfaenger,
    uebermittlungsweg: toWeg(row.uebermittlungsweg),
    manifestHash: row.manifest_hash,
    uebermitteltAt: toIsoTimestampString(row.uebermittelt_at),
    eingereichtVonSub: row.eingereicht_von_sub,
    belegRef: row.beleg_ref,
    ersetztEinreichungId: row.ersetzt_einreichung_id,
    korrekturGrundCode: row.korrektur_grund_code,
    createdAt: toIsoTimestampString(row.created_at),
  };
}

const EINREICHUNG_COLUMNS =
  'id, export_id, einsparlauf_id, art, anfrage_ref, empfaenger, uebermittlungsweg, manifest_hash, ' +
  'uebermittelt_at, eingereicht_von_sub, beleg_ref, ersetzt_einreichung_id, korrektur_grund_code, created_at';

export interface InsertEinreichungInput {
  readonly id: string;
  readonly exportId: string;
  readonly einsparlaufId: string;
  readonly art: EinreichungArt;
  readonly anfrageRef: string | null;
  readonly empfaenger: string;
  readonly uebermittlungsweg: EinreichungUebermittlungsweg;
  readonly manifestHash: Buffer;
  readonly uebermitteltAt: string;
  readonly eingereichtVonSub: string;
  readonly belegRef: string | null;
  readonly ersetztEinreichungId: string | null;
  readonly korrekturGrundCode: string | null;
}

export interface EinreichungDifferenzZeile {
  readonly einreichungId: string;
  readonly endkundeId: string;
  readonly energietraeger: string;
  readonly monat: string | null;
  readonly wertAltKwh: number | null;
  readonly wertNeuKwh: number | null;
  readonly deltaKwh: number;
  readonly ursacheCode: string;
}

interface DifferenzDbRow {
  readonly id: string;
  readonly einreichung_id: string;
  readonly endkunde_id: string;
  readonly energietraeger: string;
  readonly monat: unknown;
  readonly wert_alt_kwh: string | null;
  readonly wert_neu_kwh: string | null;
  readonly delta_kwh: string;
  readonly ursache_code: string;
}

function mapDifferenzRow(row: DifferenzDbRow): EinreichungDifferenzZeile {
  return {
    einreichungId: row.einreichung_id,
    endkundeId: row.endkunde_id,
    energietraeger: row.energietraeger,
    monat: row.monat === null ? null : toIsoDateString(row.monat),
    wertAltKwh: row.wert_alt_kwh === null ? null : Number.parseFloat(row.wert_alt_kwh),
    wertNeuKwh: row.wert_neu_kwh === null ? null : Number.parseFloat(row.wert_neu_kwh),
    deltaKwh: Number.parseFloat(row.delta_kwh),
    ursacheCode: row.ursache_code,
  };
}

export interface InsertDifferenzZeileInput {
  readonly endkundeId: string;
  readonly energietraeger: string;
  readonly wertAltKwh: number | null;
  readonly wertNeuKwh: number | null;
  readonly deltaKwh: number;
  readonly ursacheCode: string;
}

/**
 * `nachweis.einreichung`/`nachweis.einreichung_differenz` (D7) — append-only
 * (`edms_app`: NUR `INSERT, SELECT`, V0025-GRANTs). Der fail-closed
 * `BEFORE INSERT`-Trigger `nachweis.pruefe_einreichung_faehig()` ist der
 * DB-Backstop (Präzedenz V0023) — diese Klasse fügt KEINE eigene
 * Vorbedingungsprüfung hinzu (das ist `EinreichungService`-Scope, App-seitig
 * VOR dem `INSERT`, damit ein Fehlschlag ein sprechendes `ProblemDetails`
 * statt einer rohen Postgres-Exception liefert).
 */
@Injectable()
export class NachweisEinreichungRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insertEinreichung(input: InsertEinreichungInput): Promise<Einreichung> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO nachweis.einreichung
         (id, export_id, einsparlauf_id, art, anfrage_ref, empfaenger, uebermittlungsweg, manifest_hash,
          uebermittelt_at, eingereicht_von_sub, beleg_ref, ersetzt_einreichung_id, korrektur_grund_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING ${EINREICHUNG_COLUMNS}`,
      [
        input.id,
        input.exportId,
        input.einsparlaufId,
        input.art,
        input.anfrageRef,
        input.empfaenger,
        input.uebermittlungsweg,
        input.manifestHash,
        input.uebermitteltAt,
        input.eingereichtVonSub,
        input.belegRef,
        input.ersetztEinreichungId,
        input.korrekturGrundCode,
      ],
    );
    const result = mapOneRow(bindRows<EinreichungDbRow>(rawRows), mapEinreichungRow);
    if (result === undefined) {
      throw new Error('nachweis.einreichung-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }
    return result;
  }

  async insertDifferenzZeilen(einreichungId: string, zeilen: readonly InsertDifferenzZeileInput[]): Promise<void> {
    for (const z of zeilen) {
      await this.txHost.tx.query(
        `INSERT INTO nachweis.einreichung_differenz
           (id, einreichung_id, endkunde_id, energietraeger, monat, wert_alt_kwh, wert_neu_kwh, delta_kwh, ursache_code)
         VALUES (gen_random_uuid(), $1, $2, $3, NULL, $4, $5, $6, $7)`,
        [einreichungId, z.endkundeId, z.energietraeger, z.wertAltKwh, z.wertNeuKwh, z.deltaKwh, z.ursacheCode],
      );
    }
  }

  async findById(id: string): Promise<Einreichung | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(`SELECT ${EINREICHUNG_COLUMNS} FROM nachweis.einreichung WHERE id = $1`, [id]);
    return mapOneRow(bindRows<EinreichungDbRow>(rawRows), mapEinreichungRow);
  }

  /** Schlanker Existenz-/ABAC-Lesepfad (`StammdatenResourceAttributesProvider.resolveViaEinreichung()`). */
  async existsById(id: string): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query('SELECT 1 AS x FROM nachweis.einreichung WHERE id = $1', [id]);
    return bindRows<{ readonly x: number }>(rawRows).length > 0;
  }

  /**
   * `nachweis.einreichung_differenz` trägt KEINE `created_at`/`id`-Spalte
   * (V0025 — Surrogat-PK `id` ist reine Zeilenidentität, keine natürliche
   * Einfüge-Ordnung) — Cursor-Pagination läuft daher über das fachliche
   * PAAR `(endkunde_id, energietraeger)` (Muster
   * `NachweisEinsparlaufRepository.findErgebnisseByLaufId()`, v1 rendert
   * ohnehin AUSSCHLIESSLICH Jahres-Ebene-Zeilen, `monat` immer `NULL`, s.
   * `domain/einreichung-differenz.ts`-Kopfkommentar — das Paar ist damit je
   * `einreichung_id` eindeutig, `ux_einreichung_differenz_jahresebene`).
   */
  async findDifferenzenByEinreichungId(
    einreichungId: string,
    options: { readonly cursorPaar?: { readonly endkundeId: string; readonly energietraeger: string }; readonly limit: number },
  ): Promise<{ readonly daten: EinreichungDifferenzZeile[]; readonly naechsterCursor: { readonly endkundeId: string; readonly energietraeger: string } | null }> {
    const params: unknown[] = [einreichungId];
    let whereZusatz = '';
    if (options.cursorPaar !== undefined) {
      params.push(options.cursorPaar.endkundeId, options.cursorPaar.energietraeger);
      whereZusatz = `AND (endkunde_id, energietraeger) > ($${String(params.length - 1)}::uuid, $${String(params.length)})`;
    }
    params.push(options.limit + 1);
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT id, einreichung_id, endkunde_id, energietraeger, monat, wert_alt_kwh, wert_neu_kwh, delta_kwh, ursache_code
         FROM nachweis.einreichung_differenz
        WHERE einreichung_id = $1 ${whereZusatz}
        ORDER BY endkunde_id ASC, energietraeger ASC
        LIMIT $${String(params.length)}`,
      params,
    );
    const alle = mapManyRows(bindRows<DifferenzDbRow>(rawRows), mapDifferenzRow);
    if (alle.length > options.limit) {
      const daten = alle.slice(0, options.limit);
      const letzter = daten[daten.length - 1];
      return {
        daten,
        naechsterCursor: letzter === undefined ? null : { endkundeId: letzter.endkundeId, energietraeger: letzter.energietraeger },
      };
    }
    return { daten: alle, naechsterCursor: null };
  }
}
