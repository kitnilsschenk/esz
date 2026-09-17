import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../map-row';

export interface HerkunftMappingZeile {
  readonly id: string;
  readonly quelleCode: string;
  readonly chirpstackTenantId: string;
  readonly chirpstackApplicationId: string;
  readonly endkundeId: string;
  readonly standortId: string;
  /** `energy.standort.typ` — PII-frei, s. Klassen-Dok. */
  readonly standortTyp: string;
  readonly createdAt: string;
}

export interface HerkunftMappingAnlegenInput {
  readonly id: string;
  readonly quelleCode: string;
  readonly chirpstackTenantId: string;
  readonly chirpstackApplicationId: string;
  readonly endkundeId: string;
  readonly standortId: string;
}

interface HerkunftMappingRow {
  readonly id: string;
  readonly quelle_code: string;
  readonly chirpstack_tenant_id: string;
  readonly chirpstack_application_id: string;
  readonly endkunde_id: string;
  readonly standort_id: string;
  readonly standort_typ: string;
  readonly created_at: Date | string;
}

function alsIso(wert: Date | string): string {
  return wert instanceof Date ? wert.toISOString() : new Date(wert).toISOString();
}

function mapRow(row: HerkunftMappingRow): HerkunftMappingZeile {
  return {
    id: row.id,
    quelleCode: row.quelle_code,
    chirpstackTenantId: row.chirpstack_tenant_id,
    chirpstackApplicationId: row.chirpstack_application_id,
    endkundeId: row.endkunde_id,
    standortId: row.standort_id,
    standortTyp: row.standort_typ,
    createdAt: alsIso(row.created_at),
  };
}

const SELECT_SPALTEN = `hm.id,
       hm.quelle_code,
       hm.chirpstack_tenant_id,
       hm.chirpstack_application_id,
       hm.endkunde_id,
       hm.standort_id,
       s.typ AS standort_typ,
       hm.created_at`;

/**
 * Pflege der Herkunfts-Zuordnung (`ingest.herkunft_mapping`, V0042 —
 * ADR-0011 B2/D3).
 *
 * **PII-FREI, UND DAS IST EINE EINSCHRAENKUNG, KEIN NEBENBEI.** ADR-0011 D3
 * stellt als Nutzen in Aussicht, in der Quarantaene stuende kuenftig
 * „unbekanntes Geraet in *Gebaeude Lahnstein*" statt einer opaken Kennung.
 * Dieser Name ist im EDMS aber nicht frei verfuegbar: `energy.standort`
 * traegt ueberhaupt keine Bezeichnung — sie liegt feldverschluesselt in
 * `identity.standort_pii.bezeichnung_enc` (V0017, rote Linie 1: `energy.*`
 * ist PII-frei). `/monitoring/ingest` ist ausdruecklich eine PII-freie
 * Flaeche, auch fuer `compliance-auditor`.
 *
 * Aufgeloest wird deshalb auf `standort_id`, `endkunde_id` und `typ` —
 * EDMS-EIGENE Kennungen, mit denen man im System weiterspringen kann, statt
 * im fremden Netzserver nachschlagen zu muessen. Das ist der erreichbare
 * Teil des Nutzens. Den Namen zusaetzlich anzuzeigen ist eine
 * PII-Entscheidung und braucht `compliance-director` (ADR-0011 O12).
 */
@Injectable()
export class HerkunftMappingRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * Alle Zuordnungen, neueste zuerst. Bewusst OHNE Cursor-Pagination: Die
   * Tabelle hat eine Zeile je ChirpStack-Application, also die
   * Groessenordnung „Gebaeude im Bestand" — dreistellig im Ausbau. Eine
   * Blaetter-Mechanik dafuer waere Aufwand ohne Nutzen, und die Pflege-Sicht
   * will ohnehin alles auf einmal sehen, um Luecken zu erkennen.
   */
  async findAlle(): Promise<HerkunftMappingZeile[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_SPALTEN}
         FROM ingest.herkunft_mapping hm
         JOIN energy.standort s ON s.id = hm.standort_id
        ORDER BY hm.created_at DESC, hm.id DESC`,
    );

    return mapManyRows(bindRows<HerkunftMappingRow>(rawRows), mapRow);
  }

  async findById(id: string): Promise<HerkunftMappingZeile | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_SPALTEN}
         FROM ingest.herkunft_mapping hm
         JOIN energy.standort s ON s.id = hm.standort_id
        WHERE hm.id = $1`,
      [id],
    );

    return mapOneRow(bindRows<HerkunftMappingRow>(rawRows), mapRow);
  }

  /**
   * Legt eine Zuordnung an. Die drei Invarianten aus V0042 werden NICHT hier
   * nachgebaut — sie sind Constraints in der Datenbank, und dort gehoeren
   * sie hin: Eine Vorab-Pruefung im Anwendungscode waere eine zweite
   * Wahrheit, die unter Nebenlaeufigkeit ohnehin nicht haelt. Der Service
   * uebersetzt den DB-Fehler in eine verstaendliche Antwort.
   */
  async insert(input: HerkunftMappingAnlegenInput): Promise<HerkunftMappingZeile> {
    const rawRows: unknown = await this.txHost.tx.query(
      `WITH neu AS (
         INSERT INTO ingest.herkunft_mapping
           (id, quelle_code, chirpstack_tenant_id, chirpstack_application_id, endkunde_id, standort_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *
       )
       SELECT ${SELECT_SPALTEN}
         FROM neu hm
         JOIN energy.standort s ON s.id = hm.standort_id`,
      [
        input.id,
        input.quelleCode,
        input.chirpstackTenantId,
        input.chirpstackApplicationId,
        input.endkundeId,
        input.standortId,
      ],
    );

    const ergebnis = mapOneRow(bindRows<HerkunftMappingRow>(rawRows), mapRow);
    if (ergebnis === undefined) {
      throw new Error('ingest.herkunft_mapping-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return ergebnis;
  }

  /** @returns `true`, wenn eine Zeile entfernt wurde. */
  async delete(id: string): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `DELETE FROM ingest.herkunft_mapping WHERE id = $1 RETURNING id`,
      [id],
    );

    return mapOneRow(bindRows<{ readonly id: string }>(rawRows), (row) => row.id) !== undefined;
  }
}
