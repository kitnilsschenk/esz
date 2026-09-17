import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapOneRow } from '../map-row';

/** ADR-0008 §20 (D8) — query-basiertes Repository, NUR `identity.*` (DS-07-Datensubjekt). */
export interface AnschlussnutzerPiiRow {
  readonly id: string;
  readonly pseudonym_id: string;
  readonly crypto_key_id: string;
  readonly name_enc: Buffer;
  readonly kontakt_enc: Buffer | null;
  readonly pii_status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AnschlussnutzerPii {
  readonly id: string;
  readonly pseudonymId: string;
  readonly cryptoKeyId: string;
  readonly nameEnc: Buffer;
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
  // aktiv erscheinen lassen. Seit V0029 deckt `ck_anschlussnutzer_pii_status` die
  // Ursache in der DB ab; dieser Wurf ist die zweite, unabhaengige Linie.
  if (value === 'aktiv' || value === 'gesperrt' || value === 'geloescht') {
    return value;
  }
  throw new Error(
    `identity.anschlussnutzer_pii.pii_status traegt den unbekannten Wert '${value}' — Schema-Verletzung (ck_anschlussnutzer_pii_status, V0029).`,
  );
}

function mapRow(row: AnschlussnutzerPiiRow): AnschlussnutzerPii {
  return {
    id: row.id,
    pseudonymId: row.pseudonym_id,
    cryptoKeyId: row.crypto_key_id,
    nameEnc: row.name_enc,
    kontaktEnc: row.kontakt_enc,
    piiStatus: toPiiStatus(row.pii_status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = 'id, pseudonym_id, crypto_key_id, name_enc, kontakt_enc, pii_status, created_at, updated_at';

export interface InsertAnschlussnutzerPiiInput {
  readonly id: string;
  readonly pseudonymId: string;
  readonly cryptoKeyId: string;
  readonly nameEnc: Buffer;
  readonly kontaktEnc: Buffer | null;
}

@Injectable()
export class IdentityAnschlussnutzerPiiRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertAnschlussnutzerPiiInput): Promise<AnschlussnutzerPii> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO identity.anschlussnutzer_pii (id, pseudonym_id, crypto_key_id, name_enc, kontakt_enc)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${SELECT_COLUMNS}`,
      [input.id, input.pseudonymId, input.cryptoKeyId, input.nameEnc, input.kontaktEnc],
    );

    const result = mapOneRow(bindRows<AnschlussnutzerPiiRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('identity.anschlussnutzer_pii-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findByPseudonymId(pseudonymId: string): Promise<AnschlussnutzerPii | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM identity.anschlussnutzer_pii WHERE pseudonym_id = $1`,
      [pseudonymId],
    );

    return mapOneRow(bindRows<AnschlussnutzerPiiRow>(rawRows), mapRow);
  }

  /**
   * Art. 18 (Sperre) — der PII-Namensraum wird mitgefuehrt, damit die
   * Einschraenkung BEIDE Seiten erfasst (ADR-0007 A11.6, wortgleich zu
   * `IdentityEndkundePiiRepository.markGesperrt()`).
   *
   * Der `WHERE ... pii_status = 'aktiv'`-Guard plus Fallback auf
   * `findByPseudonymId()` macht den Aufruf fuer sich idempotent: die
   * eigentliche 200/409-Entscheidung faellt eine Ebene hoeher
   * (`entscheideSperre()`), diese Zeile soll bei einem zulaessigen
   * Wiederholungsaufruf lediglich nicht scheitern.
   */
  async markGesperrt(pseudonymId: string): Promise<AnschlussnutzerPii | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE identity.anschlussnutzer_pii
          SET pii_status = 'gesperrt'
        WHERE pseudonym_id = $1 AND pii_status = 'aktiv'
        RETURNING ${SELECT_COLUMNS}`,
      [pseudonymId],
    );

    const updated = mapOneRow(bindReturningRows<AnschlussnutzerPiiRow>(rawRows), mapRow);
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
  async markAktiv(pseudonymId: string): Promise<AnschlussnutzerPii | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE identity.anschlussnutzer_pii
          SET pii_status = 'aktiv'
        WHERE pseudonym_id = $1 AND pii_status = 'gesperrt'
        RETURNING ${SELECT_COLUMNS}`,
      [pseudonymId],
    );

    const updated = mapOneRow(bindReturningRows<AnschlussnutzerPiiRow>(rawRows), mapRow);
    if (updated !== undefined) {
      return updated;
    }

    return this.findByPseudonymId(pseudonymId);
  }

  /** Art. 17 (Krypto-Shredding) — Neutralisierung analog `IdentityEndkundePiiRepository`. */
  async neutralisiereUndMarkGeloescht(pseudonymId: string): Promise<AnschlussnutzerPii | undefined> {
    const neueMappingId = randomUUID();
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE identity.anschlussnutzer_pii
          SET pii_status = 'geloescht', pseudonym_id = $2
        WHERE pseudonym_id = $1
        RETURNING ${SELECT_COLUMNS}`,
      [pseudonymId, neueMappingId],
    );

    return mapOneRow(bindReturningRows<AnschlussnutzerPiiRow>(rawRows), mapRow);
  }
}
