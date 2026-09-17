import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapOneRow, mapManyRows } from '../map-row';

/**
 * ADR-0008 §20 (D8) — query-basiertes Repository, NUR `identity.*`. Die
 * Kopplung zu `energy.endkunde` läuft AUSSCHLIESSLICH logisch über
 * `pseudonym_id` (KEIN FK, KEIN JOIN, Linie 5/ADR-0004 §11-§12) — der
 * Service löst das in zwei getrennten Queries auf.
 */
export interface EndkundePiiRow {
  readonly id: string;
  readonly pseudonym_id: string;
  readonly crypto_key_id: string;
  readonly name_enc: Buffer;
  readonly anschrift_enc: Buffer;
  readonly kontakt_enc: Buffer | null;
  readonly pii_status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface EndkundePii {
  readonly id: string;
  readonly pseudonymId: string;
  readonly cryptoKeyId: string;
  readonly nameEnc: Buffer;
  readonly anschriftEnc: Buffer;
  readonly kontaktEnc: Buffer | null;
  readonly piiStatus: 'aktiv' | 'gesperrt' | 'geloescht';
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toPiiStatus(value: string): 'aktiv' | 'gesperrt' | 'geloescht' {
  // FAIL-CLOSED (Review-Fund 2026-08-26, V0029 Teil 4): bildete bis dahin
  // JEDEN unbekannten Wert still auf `'aktiv'` ab. `pii_status` steuert, ob
  // PII ausgeliefert wird und ob ein Subjekt als geschreddert gilt (Art. 17)
  // — ein Fremdwert haette einen geschredderten oder gesperrten Datensatz als
  // aktiv erscheinen lassen. Seit V0029 deckt `ck_endkunde_pii_status` die
  // Ursache in der DB ab; dieser Wurf ist die zweite, unabhaengige Linie.
  if (value === 'aktiv' || value === 'gesperrt' || value === 'geloescht') {
    return value;
  }
  throw new Error(
    `identity.endkunde_pii.pii_status traegt den unbekannten Wert '${value}' — Schema-Verletzung (ck_endkunde_pii_status, V0029).`,
  );
}

function mapRow(row: EndkundePiiRow): EndkundePii {
  return {
    id: row.id,
    pseudonymId: row.pseudonym_id,
    cryptoKeyId: row.crypto_key_id,
    nameEnc: row.name_enc,
    anschriftEnc: row.anschrift_enc,
    kontaktEnc: row.kontakt_enc,
    piiStatus: toPiiStatus(row.pii_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, pseudonym_id, crypto_key_id, name_enc, anschrift_enc, kontakt_enc, pii_status, created_at, updated_at';

export interface InsertEndkundePiiInput {
  readonly id: string;
  readonly pseudonymId: string;
  readonly cryptoKeyId: string;
  readonly nameEnc: Buffer;
  readonly anschriftEnc: Buffer;
  readonly kontaktEnc: Buffer | null;
}

export interface UpdateEndkundePiiInput {
  readonly nameEnc?: Buffer;
  readonly anschriftEnc?: Buffer;
  readonly kontaktEnc?: Buffer | null;
}

@Injectable()
export class IdentityEndkundePiiRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertEndkundePiiInput): Promise<EndkundePii> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO identity.endkunde_pii (id, pseudonym_id, crypto_key_id, name_enc, anschrift_enc, kontakt_enc)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.pseudonymId, input.cryptoKeyId, input.nameEnc, input.anschriftEnc, input.kontaktEnc],
    );

    const result = mapOneRow(bindRows<EndkundePiiRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('identity.endkunde_pii-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findByPseudonymId(pseudonymId: string): Promise<EndkundePii | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM identity.endkunde_pii WHERE pseudonym_id = $1`,
      [pseudonymId],
    );

    return mapOneRow(bindRows<EndkundePiiRow>(rawRows), mapRow);
  }

  /**
   * Batch-Variante fuer die Label-Aufloesung (ADR-0008 D12). Analog
   * `IdentityStandortPiiRepository.findManyByPseudonymIds`.
   *
   * Wird AUSSCHLIESSLICH mit einer bereits durch `PiiProjektionsPolicy`
   * gefilterten Id-Menge aufgerufen (Auflage A4: kein "PII-Entschluesseln auf
   * Vorrat") -- diese Methode selbst trifft KEINE Berechtigungsentscheidung.
   *
   * Nach einem Krypto-Shredding (Art. 17) ist `pseudonym_id` neutralisiert
   * (`neutralisiereUndMarkGeloescht`); solche Saetze fallen hier naturgemaess
   * heraus, ohne dass es eines Sonderfalls beduerfte.
   */
  async findManyByPseudonymIds(pseudonymIds: readonly string[]): Promise<EndkundePii[]> {
    if (pseudonymIds.length === 0) {
      return [];
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM identity.endkunde_pii WHERE pseudonym_id = ANY($1::uuid[])`,
      [pseudonymIds],
    );

    return mapManyRows(bindRows<EndkundePiiRow>(rawRows), mapRow);
  }

  /** Teil-Update der Klartextfelder (bereits app-seitig feldverschlüsselt, D7). */
  async updateByPseudonymId(pseudonymId: string, input: UpdateEndkundePiiInput): Promise<EndkundePii | undefined> {
    const setzungen: string[] = [];
    const werte: unknown[] = [];
    let index = 1;

    if (input.nameEnc !== undefined) {
      setzungen.push(`name_enc = $${String(index)}`);
      werte.push(input.nameEnc);
      index += 1;
    }
    if (input.anschriftEnc !== undefined) {
      setzungen.push(`anschrift_enc = $${String(index)}`);
      werte.push(input.anschriftEnc);
      index += 1;
    }
    if (input.kontaktEnc !== undefined) {
      setzungen.push(`kontakt_enc = $${String(index)}`);
      werte.push(input.kontaktEnc);
      index += 1;
    }

    if (setzungen.length === 0) {
      return this.findByPseudonymId(pseudonymId);
    }

    werte.push(pseudonymId);
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE identity.endkunde_pii SET ${setzungen.join(', ')}
        WHERE pseudonym_id = $${String(index)}
        RETURNING ${SELECT_COLUMNS}`,
      werte,
    );

    return mapOneRow(bindReturningRows<EndkundePiiRow>(rawRows), mapRow);
  }

  /** Art. 18 (Sperre) — IDEMPOTENT. */
  async markGesperrt(pseudonymId: string): Promise<EndkundePii | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE identity.endkunde_pii
          SET pii_status = 'gesperrt'
        WHERE pseudonym_id = $1 AND pii_status = 'aktiv'
        RETURNING ${SELECT_COLUMNS}`,
      [pseudonymId],
    );

    const updated = mapOneRow(bindReturningRows<EndkundePiiRow>(rawRows), mapRow);
    if (updated !== undefined) {
      return updated;
    }

    return this.findByPseudonymId(pseudonymId);
  }

  /**
   * Aufhebung der Einschraenkung im PII-Namensraum (ADR-0007 A11.10) — das
   * Gegenstueck zu `markGesperrt()`. Muss SYMMETRISCH mitgefuehrt werden:
   * bliebe `pii_status` auf `gesperrt`, waere das Subjekt fachlich wieder
   * aktiv, seine Stammdaten-PII aber weiterhin maskiert
   * (`PiiProjektionsPolicy` entscheidet fail-closed ueber DIESEN Status).
   * Genau diese halbe Aufhebung waere schwer zu bemerken — sie sieht wie ein
   * Anzeigefehler aus, nicht wie ein Zustandsfehler.
   *
   * NUR `gesperrt -> aktiv`; ein geschreddertes Subjekt (`geloescht`) bleibt
   * unberuehrt, der Aufrufer lehnt diesen Fall ohnehin vorher ab.
   */
  async markAktiv(pseudonymId: string): Promise<EndkundePii | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE identity.endkunde_pii
          SET pii_status = 'aktiv'
        WHERE pseudonym_id = $1 AND pii_status = 'gesperrt'
        RETURNING ${SELECT_COLUMNS}`,
      [pseudonymId],
    );

    const updated = mapOneRow(bindReturningRows<EndkundePiiRow>(rawRows), mapRow);
    if (updated !== undefined) {
      return updated;
    }

    return this.findByPseudonymId(pseudonymId);
  }

  /**
   * Art. 17 (Krypto-Shredding, ADR-0008 §19/D7) — NEUTRALISIERT das
   * `pseudonym_id`-Mapping (überschreibt mit einer neuen, nirgends mehr
   * referenzierten UUID; die logische Kopplung zu `energy.endkunde` wird
   * damit strukturell gekappt) UND setzt `pii_status='geloescht'`. Der
   * eigentliche Unwiderruflichkeits-Anker ist das VORGELAGERTE
   * `KryptoShreddingService.shred()` (DEK-Vernichtung) — diese Methode wird
   * daher NUR EINMAL aufgerufen (Aufrufer, `EndkundeService.shred()`, prüft
   * `energy.endkunde.verarbeitungs_status` VORAB und ruft diese Methode nur,
   * wenn das Subjekt noch NICHT gelöscht ist — s. dortiger Kommentar zur
   * Idempotenz-Strategie, da nach der Neutralisierung ein zweiter
   * `findByPseudonymId(pseudonymId)`-Aufruf naturgemäß leerläuft).
   */
  async neutralisiereUndMarkGeloescht(pseudonymId: string): Promise<EndkundePii | undefined> {
    const neueMappingId = randomUUID();
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE identity.endkunde_pii
          SET pii_status = 'geloescht', pseudonym_id = $2
        WHERE pseudonym_id = $1
        RETURNING ${SELECT_COLUMNS}`,
      [pseudonymId, neueMappingId],
    );

    return mapOneRow(bindReturningRows<EndkundePiiRow>(rawRows), mapRow);
  }
}
