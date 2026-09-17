import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { INGEST_PG_POOL } from './ingest-pg.module';
import { IngestLoggerService } from '../ingest-flow/ingest-logger.service';

/** Die zeitlichen Nachbarn eines neuen Messwerts. */
export interface Nachbarwerte {
  /** Werte VOR dem neuen `ts`, absteigend (`[0]` ist der unmittelbare Vorgaenger). */
  readonly vorherige: readonly number[];
  /** Der erste Wert NACH dem neuen `ts`, falls es einen gibt. */
  readonly naechster: number | undefined;
}

interface NachbarwertRow {
  readonly wert: string;
  readonly ts: string;
  readonly richtung: 'vorher' | 'nachher';
}

export interface UpsertMesswertInput {
  readonly messkanalKey: number;
  /** UTC-ISO-8601 (`Z`-Suffix) — s. `plausibilitaet.util.ts`/`resolveZeitstempel`. */
  readonly ts: string;
  readonly wert: number;
  readonly qualitaet: number;
  readonly herkunft: number;
}

export interface UpsertMesswertResult {
  /** `true`, wenn der Wert tatsaechlich geschrieben wurde (INSERT oder rang-gewinnendes UPDATE). */
  readonly geschrieben: boolean;
}

/**
 * ADR-0005 §24 (D12)/§27 (D15, TS-3) — der idempotente Schreibpfad. ZWEI
 * Schritte in EINER Transaktion (atomar: entweder beides oder nichts,
 * "Ack nach Commit", §15/§20 Schritt 12):
 *
 *   1. `measurement.messwert`-Upsert ueber `ON CONFLICT (messkanal_key, ts)
 *      DO UPDATE ... WHERE measurement.rang(EXCLUDED...) >
 *      measurement.rang(messwert...)` — reihenfolge-invariant (M1/M2):
 *      dieselbe Sequenz von Uplinks fuehrt UNABHAENGIG von der
 *      Ankunftsreihenfolge zum selben Endzustand, weil ausschliesslich der
 *      rang()-Vergleich entscheidet, nicht "wer zuerst kam". Ein
 *      rang-VERLIERENDER Uplink erzeugt STILL KEINE Zeilenaenderung (kein
 *      Fehler) — das ist beabsichtigtes Verhalten (s. `geschrieben: false`
 *      im Rueckgabewert, fuer Tests/Metriken sichtbar).
 *   2. `ingest.kanal_status`-GREATEST-Upsert (TS-3, §20 Schritt 11) — LAEUFT
 *      UNBEDINGT, auch wenn Schritt 1 ein rang-Verlierer-No-Op war: der
 *      Erhalt eines Uplinks fuer diesen Kanal um `ts` ist bereits ein
 *      gueltiges Freshness-/TB-04-Lebenszeichen, unabhaengig davon, ob der
 *      konkrete WERT den Rang-Vergleich gewinnt. `GREATEST` verhindert, dass
 *      ein SPAETER verarbeiteter Backfill-Datensatz (alter `ts`) das
 *      Freshness-Signal rueckwaerts dreht.
 *
 * `SELECT`-Grant auf `measurement.messwert` (V0013, Kommentar dort) ist NUR
 * fuer die referenzierten Bestandsspalten im `WHERE`-Ausdruck des Upserts
 * noetig (Postgres verlangt SELECT auf referenzierte, nicht per SET
 * geaenderte Spalten in einer UPDATE-Bedingung) — dieselbe Begruendung gilt
 * fuer `findNachbarwerte()` (Monotonie-/Skalensprung-Vorleser, s. u.).
 */
@Injectable()
export class MesswertSchreibpfadRepository {
  constructor(
    @Inject(INGEST_PG_POOL) private readonly pool: Pool,
    private readonly logger: IngestLoggerService,
  ) {}

  /**
   * ADR-0005 §20 Schritt 8 (Monotonie) und ADR-0011 O3 Punkt 3
   * (Skalensprung) — die zeitlichen NACHBARN des neuen Wertes: die
   * juengsten Werte VOR `ts` (absteigend) und der erste Wert NACH `ts`.
   *
   * **Warum relativ zu `ts` und nicht "die juengsten des Kanals".** Bis zum
   * 2026-09-09 las diese Methode schlicht die hoechsten `ts` des Kanals. Fuer
   * den Live-Pfad ist das dasselbe — dort IST der neue Wert der juengste.
   * Sobald aber ein Nachlauf (`herkunft='backfill'`) vergangene Werte
   * einspielt, ist es falsch: Der nachgereichte Zaehlerstand vom 1. Januar
   * wird gegen den bereits gespeicherten Stand vom 31. Januar geprueft, ist
   * erwartungsgemaess kleiner — und faellt als "Monotonie verletzt" in die
   * Quarantaene. Betroffen war JEDER Nachlauf, der nicht auf einem leeren
   * Kanal begann, und jede Wiederholung eines Nachlaufs.
   *
   * Die Einschraenkung war seit ADR-0005 als offener Punkt vermerkt
   * ("naechster-UND-vorheriger-Nachbar ... moeglicher Phase-4-Ausbau") und
   * blieb folgenlos, solange es keinen Aufrufer fuer den Nachlauf gab. Mit
   * dem Nachlauf-Runner gibt es einen.
   *
   * EINE Abfrage fuer beide Richtungen und beide Pruefungen: Monotonie
   * braucht den unmittelbaren Vorgaenger UND den Nachfolger, die
   * Skalensprung-Erkennung die Differenzreihe der Vorgaenger. Zwei Abfragen
   * waeren zwei Umlaeufe fuer dieselben Zeilen.
   *
   * Der Aufrufer loest den Zeitstempel deshalb VOR dieser Abfrage auf
   * (`resolveZeitstempel`, frueher Schritt 9) — ohne `ts` gibt es keine
   * Nachbarschaft, und eine Monotonie-Aussage ohne Zeitbezug ist keine.
   */
  async findNachbarwerte(messkanalKey: number, ts: string, anzahlVorher: number): Promise<Nachbarwerte> {
    const result = await this.pool.query<NachbarwertRow>(
      `WITH vorher AS (
         SELECT wert, ts FROM measurement.messwert
          WHERE messkanal_key = $1 AND ts < $2::timestamptz
          ORDER BY ts DESC LIMIT $3
       ), nachher AS (
         SELECT wert, ts FROM measurement.messwert
          WHERE messkanal_key = $1 AND ts > $2::timestamptz
          ORDER BY ts ASC LIMIT 1
       )
       SELECT wert, ts, 'vorher' AS richtung FROM vorher
       UNION ALL
       SELECT wert, ts, 'nachher' AS richtung FROM nachher`,
      [messkanalKey, ts, anzahlVorher],
    );

    // Die Reihenfolge ueber ein UNION hinweg ist nicht zugesichert — sie wird
    // hier wiederhergestellt, statt sich auf das Ausgabeverhalten zu verlassen.
    const vorherige = result.rows
      .filter((row) => row.richtung === 'vorher')
      .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
      .map((row) => Number(row.wert));
    const naechsterRow = result.rows.find((row) => row.richtung === 'nachher');

    return {
      vorherige,
      naechster: naechsterRow === undefined ? undefined : Number(naechsterRow.wert),
    };
  }

  async upsertMesswertUndFreshness(input: UpsertMesswertInput): Promise<UpsertMesswertResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const upsertResult = await client.query(
        `INSERT INTO measurement.messwert (messkanal_key, ts, wert, qualitaet, herkunft)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (messkanal_key, ts) DO UPDATE
           SET wert = EXCLUDED.wert, qualitaet = EXCLUDED.qualitaet, herkunft = EXCLUDED.herkunft
           WHERE measurement.rang(EXCLUDED.qualitaet, EXCLUDED.herkunft)
               > measurement.rang(measurement.messwert.qualitaet, measurement.messwert.herkunft)
         RETURNING messkanal_key`,
        [input.messkanalKey, input.ts, input.wert, input.qualitaet, input.herkunft],
      );

      await client.query(
        `INSERT INTO ingest.kanal_status (messkanal_key, letzter_ts, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (messkanal_key) DO UPDATE SET
           letzter_ts = GREATEST(EXCLUDED.letzter_ts, ingest.kanal_status.letzter_ts),
           updated_at = now()`,
        [input.messkanalKey, input.ts],
      );

      await client.query('COMMIT');
      return { geschrieben: upsertResult.rowCount === 1 };
    } catch (error: unknown) {
      // SA-5 (Phase-5-Security-Review): ein fehlgeschlagenes ROLLBACK darf
      // NICHT still verschluckt werden (sonst ist es fuer Diagnose/Metriken
      // unsichtbar) — geloggt via `infraFehler()` (PII-sicher), aber der
      // URSPRUENGLICHE Fehler bleibt UNVERAENDERT der, der weitergeworfen
      // wird (kein Verdecken/Ersetzen).
      await client.query('ROLLBACK').catch((rollbackError: unknown) => {
        this.logger.infraFehler('messwert_schreibpfad_rollback_fehlgeschlagen', rollbackError);
      });
      throw error;
    } finally {
      client.release();
    }
  }
}
