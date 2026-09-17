import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../map-row';

/**
 * ADR-0005 §26 (D14, O4 "Herzstueck") — query-basiertes Repository, NUR
 * `device.geraet_zuordnung`. `zaehler_id` ist ein LOGISCHER Verweis auf
 * `energy.zaehler.id` (KEIN FK, KEIN JOIN — V0002 rote Linie 1/5,
 * fortgeschrieben ADR-0005 §26.1) — die aufrufende Anwendungsschicht prueft
 * Zaehler-Existenz SELBST (analog `messkanal_key`-Konvention).
 *
 * `deveui_enc`/`deveui_blind_index` werden HIER nur als opake `Buffer`
 * durchgereicht — Entschluesseln/Blind-Index-Berechnung passiert
 * ausschliesslich in `FieldCipherService`/`BlindIndexService` (Aufrufer),
 * NIE in diesem Repository.
 */
export interface GeraetZuordnungRow {
  readonly id: string;
  readonly zaehler_id: string;
  readonly crypto_key_id: string;
  readonly deveui_enc: Buffer;
  readonly deveui_blind_index: Buffer | null;
  readonly pepper_version: number;
  readonly status: string;
  readonly gueltig_von: string;
  readonly gueltig_bis: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export type GeraetZuordnungStatus = 'aktiv' | 'inaktiv' | 'geschreddert';

export interface GeraetZuordnung {
  readonly id: string;
  readonly zaehlerId: string;
  readonly cryptoKeyId: string;
  readonly deveuiEnc: Buffer;
  readonly deveuiBlindIndex: Buffer | null;
  readonly pepperVersion: number;
  readonly status: GeraetZuordnungStatus;
  readonly gueltigVon: string;
  readonly gueltigBis: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toStatus(value: string): GeraetZuordnungStatus {
  if (value === 'inaktiv' || value === 'geschreddert') {
    return value;
  }
  return 'aktiv';
}

function mapRow(row: GeraetZuordnungRow): GeraetZuordnung {
  return {
    id: row.id,
    zaehlerId: row.zaehler_id,
    cryptoKeyId: row.crypto_key_id,
    deveuiEnc: row.deveui_enc,
    deveuiBlindIndex: row.deveui_blind_index,
    pepperVersion: row.pepper_version,
    status: toStatus(row.status),
    gueltigVon: row.gueltig_von,
    gueltigBis: row.gueltig_bis,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, zaehler_id, crypto_key_id, deveui_enc, deveui_blind_index, pepper_version, status, gueltig_von, gueltig_bis, created_at, updated_at';

export interface InsertGeraetZuordnungInput {
  readonly id: string;
  readonly zaehlerId: string;
  readonly cryptoKeyId: string;
  readonly deveuiEnc: Buffer;
  readonly deveuiBlindIndex: Buffer;
  readonly pepperVersion: number;
}

/** PG-Fehlercode fuer EXCLUDE-Constraint-Verletzung (D-EXCL, ueberlappende Zuordnung desselben Zaehlers). */
export const PG_EXCLUSION_VIOLATION = '23P01';
/** PG-Fehlercode fuer UNIQUE-Verletzung (partieller Index `ux_geraet_zuordnung_blind_index_aktiv`). */
export const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class DeviceGeraetZuordnungRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertGeraetZuordnungInput): Promise<GeraetZuordnung> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO device.geraet_zuordnung
         (id, zaehler_id, crypto_key_id, deveui_enc, deveui_blind_index, pepper_version)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.zaehlerId, input.cryptoKeyId, input.deveuiEnc, input.deveuiBlindIndex, input.pepperVersion],
    );

    const result = mapOneRow(bindRows<GeraetZuordnungRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('device.geraet_zuordnung-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findById(id: string): Promise<GeraetZuordnung | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM device.geraet_zuordnung WHERE id = $1`,
      [id],
    );

    return mapOneRow(bindRows<GeraetZuordnungRow>(rawRows), mapRow);
  }

  async findByCryptoKeyId(cryptoKeyId: string): Promise<GeraetZuordnung | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM device.geraet_zuordnung WHERE crypto_key_id = $1`,
      [cryptoKeyId],
    );

    return mapOneRow(bindRows<GeraetZuordnungRow>(rawRows), mapRow);
  }

  /**
   * Kanonisches Aktiv-Praedikat (D-KANON, ADR-0005 §26.3/§26.5, DB-1) —
   * WORTGLEICH dasselbe Praedikat wie der partielle Unique-Index
   * (`ux_geraet_zuordnung_blind_index_aktiv`) und der Worker-Lookup
   * (§26.6): `status = 'aktiv' AND gueltig_bis IS NULL`. Liefert wegen des
   * `EXCLUDE`-Constraints (D-EXCL, V0010) hoechstens EINE Zeile je
   * `zaehlerId`.
   */
  async findAktivByZaehlerId(zaehlerId: string): Promise<GeraetZuordnung | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM device.geraet_zuordnung
        WHERE zaehler_id = $1 AND status = 'aktiv' AND gueltig_bis IS NULL`,
      [zaehlerId],
    );

    return mapOneRow(bindRows<GeraetZuordnungRow>(rawRows), mapRow);
  }

  /**
   * ADR-0005 §26.5 — Shred-Kopplungs-Finder (Aufrufer:
   * `EndkundeService.shredInTx`): ALLE (nicht nur die aktuell aktive)
   * Zuordnungs-Zeilen der uebergebenen Zaehler-IDs, die NOCH NICHT
   * geschreddert sind — eine historisch bereits geschlossene
   * (`status='inaktiv'`) Zuordnung traegt weiterhin eine entschluesselbare
   * DevEUI, solange ihr eigener DEK nicht vernichtet ist; Art. 17 verlangt
   * Vollstaendigkeit ueber den gesamten Lebenszyklus der Zaehler-Zuordnungen,
   * nicht nur den aktuellen Zustand. Bereits `status='geschreddert'` (RL-4:
   * strukturell nur ueber genau diesen Pfad erreichbar) wird ausgefiltert,
   * um bei einem hypothetischen zweiten Durchlauf keine erneute Audit-Zeile
   * zu erzeugen (Idempotenz auf Aufrufer-Ebene).
   */
  async findByZaehlerIds(zaehlerIds: readonly string[]): Promise<GeraetZuordnung[]> {
    if (zaehlerIds.length === 0) {
      return [];
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM device.geraet_zuordnung
        WHERE zaehler_id = ANY($1::uuid[]) AND status <> 'geschreddert'`,
      [zaehlerIds],
    );

    return mapManyRows(bindRows<GeraetZuordnungRow>(rawRows), mapRow);
  }

  /**
   * Deaktivierung (`update:geraet_zuordnung`, ADR-0005 §26.4-Tabelle) —
   * IDEMPOTENT, analog `EnergyZaehlerRepository.stilllegen`. Schliesst
   * IMMER `gueltig_bis` mit (D-KANON, `ck_geraet_zuordnung_aktiv_praedikat`)
   * — nie nur `status` allein.
   */
  async deaktivieren(id: string): Promise<GeraetZuordnung | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE device.geraet_zuordnung
          SET status = 'inaktiv', gueltig_bis = now()
        WHERE id = $1 AND status = 'aktiv' AND gueltig_bis IS NULL
        RETURNING ${SELECT_COLUMNS}`,
      [id],
    );

    const updated = mapOneRow(bindReturningRows<GeraetZuordnungRow>(rawRows), mapRow);
    if (updated !== undefined) {
      return updated;
    }

    return this.findById(id);
  }

  /**
   * Krypto-Shredding-Kopplung (Art. 17, ADR-0005 §26.5, GB-C) — IDEMPOTENT.
   * Setzt in EINER Operation `status='geschreddert'`, `gueltig_bis` (falls
   * noch `NULL`, sonst unveraendert — D-KANON) UND nullt
   * `deveui_blind_index` (GB-C, `compliance-director`-Freigabe 2026-07-16):
   * verhindert, dass eine geshredderte Zeile ueber ihren weiterhin
   * deterministischen HMAC-Wert mit einer neuen Zuordnung fuer dasselbe
   * physische Geraet (Wiederverwendung/Re-Provisionierung) verkettet werden
   * koennte — ueber die reine DEK-Vernichtung hinaus.
   */
  async markGeschreddertByCryptoKeyId(cryptoKeyId: string): Promise<GeraetZuordnung | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE device.geraet_zuordnung
          SET status = 'geschreddert',
              gueltig_bis = COALESCE(gueltig_bis, now()),
              deveui_blind_index = NULL
        WHERE crypto_key_id = $1 AND status <> 'geschreddert'
        RETURNING ${SELECT_COLUMNS}`,
      [cryptoKeyId],
    );

    const updated = mapOneRow(bindReturningRows<GeraetZuordnungRow>(rawRows), mapRow);
    if (updated !== undefined) {
      return updated;
    }

    return this.findByCryptoKeyId(cryptoKeyId);
  }
}
