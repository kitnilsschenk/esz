import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../map-row';

/**
 * ADR-0010 D4 — query-basiertes Repository, NUR `identity.standort_pii`. Die
 * Kopplung zu `energy.standort` läuft AUSSCHLIESSLICH logisch über
 * `pseudonym_id` (KEIN FK, KEIN JOIN, Linie 5) — analog
 * `IdentityEndkundePiiRepository`.
 *
 * `crypto_key_id` ist BEWUSST NICHT unique (D4/A2): alle Standorte eines
 * Endkunden teilen sich denselben, bereits bei `identity.endkunde_pii`
 * vorhandenen DEK (1 Endkunden-DEK : n Standorte) — die Invariante
 * "Standort-DEK == Endkunden-DEK" wird SERVICE-seitig geprüft
 * (`StandortService`, kein Cross-Namespace-FK möglich).
 */
export interface StandortPiiRow {
  readonly id: string;
  readonly pseudonym_id: string;
  readonly crypto_key_id: string;
  readonly bezeichnung_enc: Buffer;
  readonly anschrift_enc: Buffer | null;
  readonly geo_enc: Buffer | null;
  readonly pii_status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface StandortPii {
  readonly id: string;
  readonly pseudonymId: string;
  readonly cryptoKeyId: string;
  readonly bezeichnungEnc: Buffer;
  readonly anschriftEnc: Buffer | null;
  readonly geoEnc: Buffer | null;
  readonly piiStatus: 'aktiv' | 'gesperrt' | 'geloescht';
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toPiiStatus(value: string): 'aktiv' | 'gesperrt' | 'geloescht' {
  // FAIL-CLOSED (Review-Fund 2026-08-26, V0029 Teil 4): bildete bis dahin
  // JEDEN unbekannten Wert still auf `'aktiv'` ab. `pii_status` steuert, ob
  // PII ausgeliefert wird und ob ein Subjekt als geschreddert gilt (Art. 17)
  // — ein Fremdwert haette einen geschredderten oder gesperrten Datensatz als
  // aktiv erscheinen lassen. Seit V0029 deckt `ck_standort_pii_status` die
  // Ursache in der DB ab; dieser Wurf ist die zweite, unabhaengige Linie.
  if (value === 'aktiv' || value === 'gesperrt' || value === 'geloescht') {
    return value;
  }
  throw new Error(
    `identity.standort_pii.pii_status traegt den unbekannten Wert '${value}' — Schema-Verletzung (ck_standort_pii_status, V0029).`,
  );
}

function mapRow(row: StandortPiiRow): StandortPii {
  return {
    id: row.id,
    pseudonymId: row.pseudonym_id,
    cryptoKeyId: row.crypto_key_id,
    bezeichnungEnc: row.bezeichnung_enc,
    anschriftEnc: row.anschrift_enc,
    geoEnc: row.geo_enc,
    piiStatus: toPiiStatus(row.pii_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, pseudonym_id, crypto_key_id, bezeichnung_enc, anschrift_enc, geo_enc, pii_status, created_at, updated_at';

export interface InsertStandortPiiInput {
  readonly id: string;
  readonly pseudonymId: string;
  readonly cryptoKeyId: string;
  readonly bezeichnungEnc: Buffer;
  readonly anschriftEnc: Buffer | null;
  readonly geoEnc: Buffer | null;
}

export interface UpdateStandortPiiInput {
  readonly bezeichnungEnc?: Buffer;
  readonly anschriftEnc?: Buffer | null;
  readonly geoEnc?: Buffer | null;
}

@Injectable()
export class IdentityStandortPiiRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertStandortPiiInput): Promise<StandortPii> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO identity.standort_pii (id, pseudonym_id, crypto_key_id, bezeichnung_enc, anschrift_enc, geo_enc)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.pseudonymId, input.cryptoKeyId, input.bezeichnungEnc, input.anschriftEnc, input.geoEnc],
    );

    const result = mapOneRow(bindRows<StandortPiiRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('identity.standort_pii-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findByPseudonymId(pseudonymId: string): Promise<StandortPii | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM identity.standort_pii WHERE pseudonym_id = $1`,
      [pseudonymId],
    );

    return mapOneRow(bindRows<StandortPiiRow>(rawRows), mapRow);
  }

  /** Batch-Lookup für die Baum-UI (`POST .../standorte/labels`, `read:standort_pii`, ADR-0010 §5). */
  async findManyByPseudonymIds(pseudonymIds: readonly string[]): Promise<StandortPii[]> {
    if (pseudonymIds.length === 0) {
      return [];
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM identity.standort_pii WHERE pseudonym_id = ANY($1::uuid[])`,
      [pseudonymIds],
    );

    return mapManyRows(bindRows<StandortPiiRow>(rawRows), mapRow);
  }

  /** Teil-Update der Klartextfelder (bereits app-seitig feldverschlüsselt, D4). */
  async updateByPseudonymId(pseudonymId: string, input: UpdateStandortPiiInput): Promise<StandortPii | undefined> {
    const setzungen: string[] = [];
    const werte: unknown[] = [];
    let index = 1;

    if (input.bezeichnungEnc !== undefined) {
      setzungen.push(`bezeichnung_enc = $${String(index)}`);
      werte.push(input.bezeichnungEnc);
      index += 1;
    }
    if (input.anschriftEnc !== undefined) {
      setzungen.push(`anschrift_enc = $${String(index)}`);
      werte.push(input.anschriftEnc);
      index += 1;
    }
    if (input.geoEnc !== undefined) {
      setzungen.push(`geo_enc = $${String(index)}`);
      werte.push(input.geoEnc);
      index += 1;
    }

    if (setzungen.length === 0) {
      return this.findByPseudonymId(pseudonymId);
    }

    werte.push(pseudonymId);
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE identity.standort_pii SET ${setzungen.join(', ')}
        WHERE pseudonym_id = $${String(index)}
        RETURNING ${SELECT_COLUMNS}`,
      werte,
    );

    return mapOneRow(bindReturningRows<StandortPiiRow>(rawRows), mapRow);
  }

  /**
   * ADR-0010 D4 — neue Shred-Dimension "Standort-PII" (analog ADR-0005 §26
   * GB-C): der DEK selbst wird bereits einmalig über
   * `KryptoShreddingService.shred(endkundePii.cryptoKeyId)` vernichtet (der
   * Endkunden-DEK IST der Standort-DEK, D4/A2) — diese Methode NEUTRALISIERT
   * zusätzlich JEDE `identity.standort_pii`-Zeile, die denselben
   * `crypto_key_id` trägt: `pii_status='geloescht'` + `pseudonym_id`
   * überschrieben (kappt die logische Kopplung zu `energy.standort`,
   * analog `IdentityEndkundePiiRepository.neutralisiereUndMarkGeloescht`).
   *
   * BEWUSST `gen_random_uuid()` IN der SQL-Anweisung (nicht ein einzelner,
   * in JS generierter Wert): `pseudonym_id` trägt `UNIQUE` — bei (typisch)
   * MEHREREN Zeilen je `crypto_key_id` (1 Endkunden-DEK : n Standorte, D4)
   * würde ein einzelner, für alle Zeilen identischer Ersatzwert die
   * UNIQUE-Constraint verletzen. `gen_random_uuid()` wird von Postgres JE
   * ZEILE neu ausgewertet.
   *
   * Liefert die ANZAHL neutralisierter Zeilen — das ist der geforderte
   * Shred-Report-Nachweis (`EndkundeService.shred()` reicht diesen Wert in
   * `ShreddingErgebnis.standortPiiNeutralisiert` durch): der DEK wird nur
   * EINMAL vernichtet, der Report muss die REICHWEITE (wie viele Standorte
   * betroffen sind) trotzdem belegen.
   */
  /**
   * Hartes DELETE (D2.6, "Korrektur von Fehlanlagen") — nur vom
   * `StandortService.loeschen()`-Pfad genutzt, NACHDEM der Aufrufer bereits
   * geprüft hat, dass der zugehörige `energy.standort`-Knoten ein
   * Blattknoten OHNE Verortungshistorie ist. Verhindert eine dauerhaft
   * verwaiste `identity.standort_pii`-Zeile (kein FK, keine DB-Kaskade
   * möglich, Linie 5 — daher App-seitig orchestriert).
   */
  async deleteByPseudonymId(pseudonymId: string): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `DELETE FROM identity.standort_pii WHERE pseudonym_id = $1 RETURNING id`,
      [pseudonymId],
    );
    return bindReturningRows<{ readonly id: string }>(rawRows).length > 0;
  }

  async neutralisiereAlleUndMarkGeloeschtByCryptoKeyId(cryptoKeyId: string): Promise<number> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE identity.standort_pii
          SET pii_status = 'geloescht', pseudonym_id = gen_random_uuid()
        WHERE crypto_key_id = $1 AND pii_status <> 'geloescht'
        RETURNING id`,
      [cryptoKeyId],
    );

    return bindReturningRows<{ readonly id: string }>(rawRows).length;
  }
}
