import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import { toIsoTimestampString } from '../../berechnung/persistence/pg-date.util';
import type { ExportKategorie } from '../export/nachweis-export-spaltenprofil.const';

export type ExportZweck = 'nachweis' | 'erfolgskontrolle' | 'wissenschaftliche_auswertung';
export type ExportStationDarstellung = 'pseudonymisiert' | 'klarname';

export interface NachweisExport {
  readonly id: string;
  readonly einsparlaufId: string;
  readonly schemaCode: string;
  readonly schemaVersion: number;
  readonly format: string;
  readonly zweck: ExportZweck;
  readonly de04Auszug: boolean;
  readonly pseudonymProfil: string;
  readonly stationDarstellung: ExportStationDarstellung;
  readonly anfrageRef: string | null;
  readonly manifestHash: Buffer;
  readonly dateienAnzahl: number;
  readonly zeilenAnzahlGesamt: string;
  readonly erzeugtAt: string;
  readonly erzeugtVonSub: string;
}

interface ExportDbRow {
  readonly id: string;
  readonly einsparlauf_id: string;
  readonly schema_code: string;
  readonly schema_version: number;
  readonly format: string;
  readonly zweck: string;
  readonly de04_auszug: boolean;
  readonly pseudonym_profil: string;
  readonly station_darstellung: string;
  readonly anfrage_ref: string | null;
  readonly manifest_hash: Buffer;
  readonly dateien_anzahl: number;
  readonly zeilen_anzahl_gesamt: string;
  /** `timestamptz` — `pg` liefert zur Laufzeit ein `Date`-Objekt, NIE direkt als `string` verwenden (s. `toIsoTimestampString()`-Import). */
  readonly erzeugt_at: unknown;
  readonly erzeugt_von_sub: string;
}

function toZweck(value: string): ExportZweck {
  return value === 'erfolgskontrolle' || value === 'wissenschaftliche_auswertung' ? value : 'nachweis';
}
function toStationDarstellung(value: string): ExportStationDarstellung {
  return value === 'klarname' ? 'klarname' : 'pseudonymisiert';
}

function mapExportRow(row: ExportDbRow): NachweisExport {
  return {
    id: row.id,
    einsparlaufId: row.einsparlauf_id,
    schemaCode: row.schema_code,
    schemaVersion: row.schema_version,
    format: row.format,
    zweck: toZweck(row.zweck),
    de04Auszug: row.de04_auszug,
    pseudonymProfil: row.pseudonym_profil,
    stationDarstellung: toStationDarstellung(row.station_darstellung),
    anfrageRef: row.anfrage_ref,
    manifestHash: row.manifest_hash,
    dateienAnzahl: row.dateien_anzahl,
    zeilenAnzahlGesamt: row.zeilen_anzahl_gesamt,
    erzeugtAt: toIsoTimestampString(row.erzeugt_at),
    erzeugtVonSub: row.erzeugt_von_sub,
  };
}

const EXPORT_COLUMNS =
  'id, einsparlauf_id, schema_code, schema_version, format, zweck, de04_auszug, pseudonym_profil, ' +
  'station_darstellung, anfrage_ref, manifest_hash, dateien_anzahl, zeilen_anzahl_gesamt, erzeugt_at, erzeugt_von_sub';

export interface InsertExportInput {
  readonly id: string;
  readonly einsparlaufId: string;
  readonly schemaCode: string;
  readonly schemaVersion: number;
  readonly format: 'csv' | 'csv+xlsx';
  readonly zweck: ExportZweck;
  readonly pseudonymProfil: string;
  readonly stationDarstellung: ExportStationDarstellung;
  readonly anfrageRef: string | null;
  readonly manifestHash: Buffer;
  readonly dateienAnzahl: number;
  readonly zeilenAnzahlGesamt: number;
  /** Explizit vom Aufrufer vergeben (NICHT `DEFAULT now()`) — MUSS exakt dem im Metablatt gerenderten `erzeugt_at_utc` entsprechen (Determinismus, s. `nachweis-export.service.ts`). */
  readonly erzeugtAt: string;
  readonly erzeugtVonSub: string;
}

export interface NachweisExportDatei {
  readonly exportId: string;
  readonly dateiname: string;
  readonly kategorie: ExportKategorie;
  readonly zeilenAnzahl: string;
  readonly dateiHash: Buffer;
}

interface ExportDateiDbRow {
  readonly export_id: string;
  readonly dateiname: string;
  readonly kategorie: string;
  readonly zeilen_anzahl: string;
  readonly datei_hash: Buffer;
}

function mapExportDateiRow(row: ExportDateiDbRow): NachweisExportDatei {
  return {
    exportId: row.export_id,
    dateiname: row.dateiname,
    kategorie: row.kategorie as ExportKategorie,
    zeilenAnzahl: row.zeilen_anzahl,
    dateiHash: row.datei_hash,
  };
}

export interface InsertExportDateiInput {
  readonly dateiname: string;
  readonly kategorie: ExportKategorie;
  readonly zeilenAnzahl: number;
  readonly dateiHash: Buffer;
}

/**
 * `nachweis.export`/`nachweis.export_datei` (D5) — append-only Artefakt-
 * METADATEN, NIEMALS Datei-Bytes (O-B10, „die Bytes werden nicht
 * gespeichert"). Läuft — wie `NachweisExportPseudonymRepository` — laufzeit-
 * heute unter der App-Verbindung `edms`; dokumentierte Zielrolle
 * `edms_nachweis_renderer` (V0025-GRANTs: SELECT+INSERT auf `export`/
 * `export_datei`), s. dortigen Kopfkommentar zur Ein-Zeilen-Umstellung.
 */
@Injectable()
export class NachweisExportRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insertExport(input: InsertExportInput): Promise<NachweisExport> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO nachweis.export
         (id, einsparlauf_id, schema_code, schema_version, format, zweck, pseudonym_profil,
          station_darstellung, anfrage_ref, manifest_hash, dateien_anzahl, zeilen_anzahl_gesamt,
          erzeugt_at, erzeugt_von_sub)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING ${EXPORT_COLUMNS}`,
      [
        input.id,
        input.einsparlaufId,
        input.schemaCode,
        input.schemaVersion,
        input.format,
        input.zweck,
        input.pseudonymProfil,
        input.stationDarstellung,
        input.anfrageRef,
        input.manifestHash,
        input.dateienAnzahl,
        input.zeilenAnzahlGesamt,
        input.erzeugtAt,
        input.erzeugtVonSub,
      ],
    );
    const result = mapOneRow(bindRows<ExportDbRow>(rawRows), mapExportRow);
    if (result === undefined) {
      throw new Error('nachweis.export-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }
    return result;
  }

  async insertExportDateien(exportId: string, dateien: readonly InsertExportDateiInput[]): Promise<void> {
    for (const d of dateien) {
      await this.txHost.tx.query(
        `INSERT INTO nachweis.export_datei (export_id, dateiname, kategorie, zeilen_anzahl, datei_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [exportId, d.dateiname, d.kategorie, d.zeilenAnzahl, d.dateiHash],
      );
    }
  }

  async findById(id: string): Promise<NachweisExport | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(`SELECT ${EXPORT_COLUMNS} FROM nachweis.export WHERE id = $1`, [id]);
    return mapOneRow(bindRows<ExportDbRow>(rawRows), mapExportRow);
  }

  /** Schlanker Existenz-/ABAC-Lesepfad (`StammdatenResourceAttributesProvider.resolveViaNachweisExport()`). */
  async existsById(id: string): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query('SELECT 1 AS x FROM nachweis.export WHERE id = $1', [id]);
    return bindRows<{ readonly x: number }>(rawRows).length > 0;
  }

  async findDateiByName(exportId: string, dateiname: string): Promise<NachweisExportDatei | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      'SELECT export_id, dateiname, kategorie, zeilen_anzahl, datei_hash FROM nachweis.export_datei WHERE export_id = $1 AND dateiname = $2',
      [exportId, dateiname],
    );
    return mapOneRow(bindRows<ExportDateiDbRow>(rawRows), mapExportDateiRow);
  }

  async findDateienByExportId(exportId: string): Promise<NachweisExportDatei[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      'SELECT export_id, dateiname, kategorie, zeilen_anzahl, datei_hash FROM nachweis.export_datei WHERE export_id = $1 ORDER BY dateiname ASC',
      [exportId],
    );
    return mapManyRows(bindRows<ExportDateiDbRow>(rawRows), mapExportDateiRow);
  }
}
