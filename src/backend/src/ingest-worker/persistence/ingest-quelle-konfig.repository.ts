import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { INGEST_PG_POOL } from './ingest-pg.module';

/**
 * Liest die gepflegte Konfiguration einer Datenquelle (`ingest.quelle`,
 * V0059) — die Worker-Seite.
 *
 * **NUR lesend, und das ist eine Rechte-Zusage, keine Konvention.** V0059
 * erteilt `edms_ingest_worker` ausschließlich `SELECT` auf diese Tabelle: Ein
 * Prozess, der Uplinks aus dem Netz entgegennimmt, soll seine eigene
 * Konfiguration nicht ändern können.
 *
 * Die Chiffrate kommen roh heraus; entschlüsselt wird eine Ebene höher
 * (`IngestQuelleKonfigService`), damit der Klartext eines Geheimnisses nur in
 * genau einer Methode existiert und nicht durch die Persistenzschicht wandert.
 */
export interface IngestQuelleKonfigRow {
  readonly id: string;
  readonly quelle_code: string;
  readonly broker_host: string;
  readonly topic: string;
  readonly client_id: string;
  readonly tls_modus: string;
  readonly status: string;
  readonly benutzername_enc: Buffer | null;
  readonly passwort_enc: Buffer | null;
  readonly ca_zertifikat_enc: Buffer | null;
  readonly client_zertifikat_enc: Buffer | null;
  readonly client_schluessel_enc: Buffer | null;
  readonly wrapped_dek: Buffer;
  readonly kms_key_id: string;
  readonly alg_version: number;
}

@Injectable()
export class IngestQuelleKonfigRepository {
  constructor(@Inject(INGEST_PG_POOL) private readonly pool: Pool) {}

  /**
   * Die Quelle samt ihrem Schlüssel in EINER Abfrage. Getrennt zu laden hieße,
   * zwischen beiden Abfragen einen Zustand zuzulassen, in dem die Quelle
   * schon da, ihr Schlüssel aber noch nicht sichtbar ist.
   */
  async findByCode(quelleCode: string): Promise<IngestQuelleKonfigRow | undefined> {
    const ergebnis = await this.pool.query<IngestQuelleKonfigRow>(
      `SELECT q.id, q.quelle_code, q.broker_host, q.topic, q.client_id, q.tls_modus, q.status,
              q.benutzername_enc, q.passwort_enc, q.ca_zertifikat_enc, q.client_zertifikat_enc,
              q.client_schluessel_enc,
              s.wrapped_dek, s.kms_key_id, s.alg_version
         FROM ingest.quelle q
         JOIN ingest.quelle_schluessel s ON s.id = q.crypto_key_id
        WHERE q.quelle_code = $1`,
      [quelleCode],
    );
    return ergebnis.rows[0];
  }
}
