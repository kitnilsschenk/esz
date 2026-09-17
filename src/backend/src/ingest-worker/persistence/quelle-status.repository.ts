import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { INGEST_PG_POOL } from './ingest-pg.module';

export interface QuelleStatusUpsertInput {
  readonly quelleCode: string;
  /** NUR Host[:Port] — Zugangsdaten sind bereits entfernt (`brokerHostOhneCredentials`). */
  readonly brokerHost: string;
  readonly topic: string;
  readonly clientId: string;
  readonly verbunden: boolean;
  /** Zeitpunkt des letzten erfolgreichen Verbindungsaufbaus; `undefined` = seit Prozessstart nie verbunden. */
  readonly letzteVerbindungAt?: Date;
}

/**
 * Schreibt den Herzschlag dieses Worker-Prozesses (ADR-0011 O8/D8) —
 * EINE Zeile je Quelle, per Upsert.
 *
 * **Warum eine Tabelle und kein Metriken-Endpunkt am Worker:** Der Worker
 * ist ein eigener Prozess ohne HTTP-Oberfläche, und in einem Deployment mit
 * mehreren Quellen liefe er womöglich gar nicht auf demselben Rechner wie
 * die API. Die Datenbank ist der Weg, den beide ohnehin teilen.
 *
 * `letzte_verbindung_at` wird nur FORTGESCHRIEBEN, nie zurückgesetzt: Nach
 * einem Verbindungsabriss soll ablesbar bleiben, wann es zuletzt
 * funktioniert hat.
 */
@Injectable()
export class QuelleStatusRepository {
  constructor(@Inject(INGEST_PG_POOL) private readonly pool: Pool) {}

  async upsert(input: QuelleStatusUpsertInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO ingest.quelle_status
         (id, quelle_code, broker_host, topic, client_id, verbunden, letzte_verbindung_at, letzter_herzschlag_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (quelle_code) DO UPDATE SET
         broker_host           = EXCLUDED.broker_host,
         topic                 = EXCLUDED.topic,
         client_id             = EXCLUDED.client_id,
         verbunden             = EXCLUDED.verbunden,
         letzte_verbindung_at  = COALESCE(EXCLUDED.letzte_verbindung_at, ingest.quelle_status.letzte_verbindung_at),
         letzter_herzschlag_at = now()`,
      [
        randomUUID(),
        input.quelleCode,
        input.brokerHost,
        input.topic,
        input.clientId,
        input.verbunden,
        input.letzteVerbindungAt ?? null,
      ],
    );
  }
}
