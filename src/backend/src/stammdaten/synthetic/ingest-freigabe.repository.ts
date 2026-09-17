import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapOneRow } from '../persistence/map-row';

/** Der aktuell geltende Stand der Ingest-Gate-Erklärung (V0083). */
export interface IngestFreigabeStand {
  readonly wirksam: boolean;
  readonly art: string;
  readonly aktenstandFingerabdruck: string | null;
  readonly freigabeRef: string | null;
  readonly attestiertDurch: string | null;
  readonly erklaertAt: Date;
}

interface IngestFreigabeStandRow {
  readonly wirksam: boolean;
  readonly art: string;
  readonly aktenstand_fingerabdruck: string | null;
  readonly freigabe_ref: string | null;
  readonly attestiert_durch: string | null;
  readonly erklaert_at: Date;
}

/**
 * Lesepfad auf den Ingest-Gate-Marker (`gate.ingest_freigabe_stand`, V0083).
 *
 * **Bewusst NUR lesend.** `edms_app` hat auf `gate.ingest_freigabe` gar kein
 * `INSERT` — das Recht liegt allein bei `edms_ingest_freigabe`. Das ist der
 * ganze Zweck des Markers (ADR-0008 §22): Wer den Schalter umlegt, soll nicht
 * derselbe sein können, der behauptet, die Voraussetzungen lägen vor. Ein
 * Schreibpfad in dieser Klasse würde die Trennung im Code wieder einreißen,
 * die das Schema gerade herstellt — die Datenbank wiese ihn ab, aber schon
 * der Versuch wäre ein Missverständnis des Entwurfs.
 */
@Injectable()
export class IngestFreigabeRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * Die zuletzt abgegebene Erklärung, oder `undefined`, wenn nie eine
   * abgegeben wurde — der Normalzustand einer frischen Installation.
   */
  async leseStand(): Promise<IngestFreigabeStand | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT wirksam, art, aktenstand_fingerabdruck, freigabe_ref, attestiert_durch, erklaert_at
         FROM gate.ingest_freigabe_stand`,
      [],
    );

    return mapOneRow(bindRows<IngestFreigabeStandRow>(rawRows), (row) => ({
      wirksam: row.wirksam,
      art: row.art,
      aktenstandFingerabdruck: row.aktenstand_fingerabdruck,
      freigabeRef: row.freigabe_ref,
      attestiertDurch: row.attestiert_durch,
      erklaertAt: row.erklaert_at,
    }));
  }
}
