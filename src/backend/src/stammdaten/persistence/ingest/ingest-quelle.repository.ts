import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../map-row';
import { toIsoTimestampString } from '../../../berechnung/persistence/pg-date.util';

export type TlsModus = 'kein_tls' | 'tls' | 'mtls';
export type QuelleStatus = 'aktiv' | 'inaktiv';

/**
 * `ingest.quelle` (V0059) — die gepflegte Konfiguration einer Datenquelle.
 *
 * **Die Chiffrate bleiben in diesem Typ.** Eine Variante ohne sie wäre
 * bequemer, verschöbe die Entscheidung aber an den Aufrufer: Wer die Zeile
 * lädt, soll sehen, dass hier Geheimnisse hängen. Wer sie NICHT braucht — und
 * das ist jeder außer dem Worker — nimmt `IngestQuelleOhneGeheimnis`, das der
 * Service daraus ableitet. Die API-Schicht bekommt die Chiffrate nie zu
 * Gesicht.
 */
export interface IngestQuelle {
  readonly id: string;
  readonly quelleCode: string;
  readonly bezeichnung: string;
  readonly brokerHost: string;
  readonly topic: string;
  readonly clientId: string;
  readonly tlsModus: TlsModus;
  readonly cryptoKeyId: string;
  readonly benutzernameEnc: Buffer | null;
  readonly passwortEnc: Buffer | null;
  readonly clientSchluesselEnc: Buffer | null;
  readonly caZertifikatEnc: Buffer | null;
  readonly clientZertifikatEnc: Buffer | null;
  readonly status: QuelleStatus;
  readonly notiz: string | null;
  /** `notAfter` der hinterlegten Zertifikate; `null` = keines hinterlegt. */
  readonly caZertifikatGueltigBis: string | null;
  readonly clientZertifikatGueltigBis: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface QuelleRow {
  readonly id: string;
  readonly quelle_code: string;
  readonly bezeichnung: string;
  readonly broker_host: string;
  readonly topic: string;
  readonly client_id: string;
  readonly tls_modus: string;
  readonly crypto_key_id: string;
  readonly benutzername_enc: Buffer | null;
  readonly passwort_enc: Buffer | null;
  readonly client_schluessel_enc: Buffer | null;
  readonly ca_zertifikat_enc: Buffer | null;
  readonly client_zertifikat_enc: Buffer | null;
  readonly status: string;
  readonly notiz: string | null;
  /** `timestamptz` — `pg` liefert ein `Date`, NIE direkt als String verwenden. */
  readonly ca_zertifikat_gueltig_bis: unknown;
  readonly client_zertifikat_gueltig_bis: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

function toTlsModus(value: string): TlsModus {
  return value === 'tls' || value === 'mtls' ? value : 'kein_tls';
}

function toStatus(value: string): QuelleStatus {
  return value === 'inaktiv' ? 'inaktiv' : 'aktiv';
}

function mapRow(row: QuelleRow): IngestQuelle {
  return {
    id: row.id,
    quelleCode: row.quelle_code,
    bezeichnung: row.bezeichnung,
    brokerHost: row.broker_host,
    topic: row.topic,
    clientId: row.client_id,
    tlsModus: toTlsModus(row.tls_modus),
    cryptoKeyId: row.crypto_key_id,
    benutzernameEnc: row.benutzername_enc,
    passwortEnc: row.passwort_enc,
    clientSchluesselEnc: row.client_schluessel_enc,
    caZertifikatEnc: row.ca_zertifikat_enc,
    clientZertifikatEnc: row.client_zertifikat_enc,
    status: toStatus(row.status),
    notiz: row.notiz,
    caZertifikatGueltigBis: row.ca_zertifikat_gueltig_bis === null ? null : toIsoTimestampString(row.ca_zertifikat_gueltig_bis),
    clientZertifikatGueltigBis:
      row.client_zertifikat_gueltig_bis === null ? null : toIsoTimestampString(row.client_zertifikat_gueltig_bis),
    createdAt: toIsoTimestampString(row.created_at),
    updatedAt: toIsoTimestampString(row.updated_at),
  };
}

const SELECT_COLUMNS =
  'id, quelle_code, bezeichnung, broker_host, topic, client_id, tls_modus, crypto_key_id, ' +
  'benutzername_enc, passwort_enc, client_schluessel_enc, ca_zertifikat_enc, client_zertifikat_enc, ' +
  'ca_zertifikat_gueltig_bis, client_zertifikat_gueltig_bis, status, notiz, created_at, updated_at';

export interface InsertIngestQuelleInput {
  readonly id: string;
  readonly quelleCode: string;
  readonly bezeichnung: string;
  readonly brokerHost: string;
  readonly topic: string;
  readonly clientId: string;
  readonly tlsModus: TlsModus;
  readonly cryptoKeyId: string;
  readonly benutzernameEnc: Buffer | null;
  readonly passwortEnc: Buffer | null;
  readonly clientSchluesselEnc: Buffer | null;
  readonly caZertifikatEnc: Buffer | null;
  readonly clientZertifikatEnc: Buffer | null;
  readonly caZertifikatGueltigBis: string | null;
  readonly clientZertifikatGueltigBis: string | null;
  readonly notiz: string | null;
}

/**
 * Änderbare Felder. Ein `undefined` heißt „nicht anfassen" — insbesondere bei
 * den Geheimnissen: Wer eine Quelle umbenennt, soll nicht versehentlich ihr
 * Passwort löschen, nur weil das Formular es (richtigerweise) nicht mitschickt.
 */
export interface UpdateIngestQuelleInput {
  readonly bezeichnung?: string;
  readonly brokerHost?: string;
  readonly topic?: string;
  readonly clientId?: string;
  readonly tlsModus?: TlsModus;
  readonly status?: QuelleStatus;
  readonly notiz?: string | null;
  readonly benutzernameEnc?: Buffer | null;
  readonly passwortEnc?: Buffer | null;
  readonly clientSchluesselEnc?: Buffer | null;
  readonly caZertifikatEnc?: Buffer | null;
  readonly clientZertifikatEnc?: Buffer | null;
  readonly caZertifikatGueltigBis?: string | null;
  readonly clientZertifikatGueltigBis?: string | null;
}

@Injectable()
export class IngestQuelleRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertIngestQuelleInput): Promise<IngestQuelle> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO ingest.quelle
         (id, quelle_code, bezeichnung, broker_host, topic, client_id, tls_modus, crypto_key_id,
          benutzername_enc, passwort_enc, client_schluessel_enc, ca_zertifikat_enc, client_zertifikat_enc,
          ca_zertifikat_gueltig_bis, client_zertifikat_gueltig_bis, notiz)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.id,
        input.quelleCode,
        input.bezeichnung,
        input.brokerHost,
        input.topic,
        input.clientId,
        input.tlsModus,
        input.cryptoKeyId,
        input.benutzernameEnc,
        input.passwortEnc,
        input.clientSchluesselEnc,
        input.caZertifikatEnc,
        input.clientZertifikatEnc,
        input.caZertifikatGueltigBis,
        input.clientZertifikatGueltigBis,
        input.notiz,
      ],
    );

    const result = mapOneRow(bindRows<QuelleRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('ingest.quelle-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }
    return result;
  }

  async findById(id: string): Promise<IngestQuelle | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(`SELECT ${SELECT_COLUMNS} FROM ingest.quelle WHERE id = $1`, [id]);
    return mapOneRow(bindRows<QuelleRow>(rawRows), mapRow);
  }

  async findByCode(quelleCode: string): Promise<IngestQuelle | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM ingest.quelle WHERE quelle_code = $1`,
      [quelleCode],
    );
    return mapOneRow(bindRows<QuelleRow>(rawRows), mapRow);
  }

  /**
   * Alle Quellen, jüngste zuerst. Bewusst ohne Cursor-Pagination: Ein Betrieb
   * führt eine Handvoll Netze, nicht Tausende — eine „Weitere laden"-Schaltfläche
   * wäre hier Beiwerk, das nie gedrückt wird.
   */
  async findAll(): Promise<readonly IngestQuelle[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM ingest.quelle ORDER BY created_at DESC, id DESC`,
    );
    return mapManyRows(bindRows<QuelleRow>(rawRows), mapRow);
  }

  /**
   * Teil-Aktualisierung. Felder, die `undefined` sind, bleiben unangetastet —
   * `null` dagegen LÖSCHT (ein Geheimnis entfernen muss möglich sein).
   */
  async update(id: string, input: UpdateIngestQuelleInput): Promise<IngestQuelle | undefined> {
    const zuweisungen: string[] = [];
    const params: unknown[] = [id];

    const setze = (spalte: string, wert: unknown): void => {
      params.push(wert);
      zuweisungen.push(`${spalte} = $${String(params.length)}`);
    };

    if (input.bezeichnung !== undefined) setze('bezeichnung', input.bezeichnung);
    if (input.brokerHost !== undefined) setze('broker_host', input.brokerHost);
    if (input.topic !== undefined) setze('topic', input.topic);
    if (input.clientId !== undefined) setze('client_id', input.clientId);
    if (input.tlsModus !== undefined) setze('tls_modus', input.tlsModus);
    if (input.status !== undefined) setze('status', input.status);
    if (input.notiz !== undefined) setze('notiz', input.notiz);
    if (input.benutzernameEnc !== undefined) setze('benutzername_enc', input.benutzernameEnc);
    if (input.passwortEnc !== undefined) setze('passwort_enc', input.passwortEnc);
    if (input.clientSchluesselEnc !== undefined) setze('client_schluessel_enc', input.clientSchluesselEnc);
    if (input.caZertifikatEnc !== undefined) setze('ca_zertifikat_enc', input.caZertifikatEnc);
    if (input.clientZertifikatEnc !== undefined) setze('client_zertifikat_enc', input.clientZertifikatEnc);
    if (input.caZertifikatGueltigBis !== undefined) setze('ca_zertifikat_gueltig_bis', input.caZertifikatGueltigBis);
    if (input.clientZertifikatGueltigBis !== undefined)
      setze('client_zertifikat_gueltig_bis', input.clientZertifikatGueltigBis);

    if (zuweisungen.length === 0) {
      return this.findById(id);
    }

    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE ingest.quelle SET ${zuweisungen.join(', ')} WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
      params,
    );
    // UPDATE … RETURNING liefert bei TypeORM ein [rows, rowCount]-Tupel —
    // `bindReturningRows`, nicht `bindRows`.
    return mapOneRow(bindReturningRows<QuelleRow>(rawRows), mapRow);
  }
}
