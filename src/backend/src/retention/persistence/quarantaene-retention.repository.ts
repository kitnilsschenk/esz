import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapOneRow } from '../../stammdaten/persistence/map-row';

/**
 * Wie viele Zeilen ein Lauf höchstens auf einmal anfasst.
 *
 * `.claude/rules/database-migrations.md` verbietet Datenkopien ohne
 * Batch-Grenze; dasselbe gilt für Löschungen. Ein einzelnes Störgerät im
 * 15-Minuten-Takt erzeugt in 90 Tagen rund 8.600 Zeilen — ein
 * `DELETE` darüber in einer Transaktion hielte Sperren über Sekunden und
 * ließe den Ingest gegen dieselbe Tabelle anlaufen.
 *
 * Der Aufrufer wiederholt den Lauf, bis nichts mehr zurückkommt; ein
 * Restbestand ist kein Fehler, sondern der nächste Durchgang.
 */
export const BATCH_GRENZE = 1000;

/**
 * Die Bedingung „gehört zu einem offenen Ausfall-Vorgang".
 *
 * `ingest.eingang_quarantaene.messkanal_key` ist NULLABLE (nicht jede
 * liegengebliebene Nachricht ließ sich einem Kanal zuordnen) und ein
 * LOGISCHER Verweis ohne Fremdschlüssel — die Bedingung muss beides
 * aushalten. Eine Zeile OHNE Kanal kann zu keinem Vorgang gehören und ist
 * damit nie geschützt.
 */
const GEHOERT_ZU_OFFENEM_VORGANG = `q.messkanal_key IS NOT NULL
     AND EXISTS (
           SELECT 1
             FROM ingest.ausfall_vorgang av
            WHERE av.messkanal_key = q.messkanal_key
              AND av.status <> 'behoben'
         )`;

interface AnzahlRow {
  readonly anzahl: string;
}

function alsAnzahl(rows: unknown): number {
  return Number(mapOneRow(bindRows<AnzahlRow>(rows), (row) => row.anzahl) ?? '0');
}

/**
 * Datenzugriffe des Quarantäne-Löschlaufs (Votum 2026-09-05, Punkt 3).
 *
 * **Alle Fristen kommen als Parameter herein.** Der Repository kennt keine
 * Zahl — sonst gäbe es zwei Orte, an denen eine Frist stünde, und der eine
 * würde beim Ändern vergessen.
 *
 * **`empfangen_at`, nicht `created_at`** (Auflage Q.4): Bei einem Backfill
 * fallen beide auseinander, und maßgeblich ist, wann die Nachricht eintraf —
 * nicht, wann die Zeile geschrieben wurde.
 */
@Injectable()
export class QuarantaeneRetentionRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async zaehleNullungsKandidaten(stichtag: Date): Promise<number> {
    const rows: unknown = await this.txHost.tx.query(
      `SELECT count(*)::text AS anzahl
         FROM ingest.eingang_quarantaene q
        WHERE q.deveui_blind_index IS NOT NULL
          AND q.empfangen_at < $1`,
      [stichtag],
    );
    return alsAnzahl(rows);
  }

  async zaehleLoeschKandidaten(stichtag: Date, obergrenze: Date): Promise<number> {
    const rows: unknown = await this.txHost.tx.query(
      `SELECT count(*)::text AS anzahl
         FROM ingest.eingang_quarantaene q
        WHERE q.empfangen_at < $1
          AND (q.empfangen_at < $2 OR NOT (${GEHOERT_ZU_OFFENEM_VORGANG}))`,
      [stichtag, obergrenze],
    );
    return alsAnzahl(rows);
  }

  /**
   * Zeilen, die fällig WÄREN, aber wegen eines offenen Ausfall-Vorgangs
   * stehen bleiben — und die Obergrenze noch nicht gerissen haben.
   *
   * Diese Zahl gehört ins Audit-Ereignis: Ohne sie wäre ein Lauf, der wegen
   * eines seit Monaten offenen Vorgangs nichts löscht, von einem Lauf ohne
   * Kandidaten nicht zu unterscheiden.
   */
  async zaehleUebersprungeneWegenOffenemVorgang(stichtag: Date, obergrenze: Date): Promise<number> {
    const rows: unknown = await this.txHost.tx.query(
      `SELECT count(*)::text AS anzahl
         FROM ingest.eingang_quarantaene q
        WHERE q.empfangen_at < $1
          AND q.empfangen_at >= $2
          AND ${GEHOERT_ZU_OFFENEM_VORGANG}`,
      [stichtag, obergrenze],
    );
    return alsAnzahl(rows);
  }

  /**
   * Nullt den Blind-Index. **Ohne Schutz durch offene Ausfall-Vorgänge** —
   * und das ist Absicht: Der Schutz gilt der Zeile (dem Trendwert für die
   * Fehlersuche), nicht dem personenbeziehbaren Korrelat. Wer einen offenen
   * Vorgang bearbeitet, braucht `grund`, `topic_redacted` und `fPort` — nicht
   * den Blind-Index.
   */
  async nulleBlindIndex(stichtag: Date): Promise<number> {
    const rows: unknown = await this.txHost.tx.query(
      `UPDATE ingest.eingang_quarantaene
          SET deveui_blind_index = NULL
        WHERE id IN (
              SELECT q.id
                FROM ingest.eingang_quarantaene q
               WHERE q.deveui_blind_index IS NOT NULL
                 AND q.empfangen_at < $1
               ORDER BY q.empfangen_at ASC
               LIMIT ${BATCH_GRENZE}
        )
       RETURNING 1 AS anzahl`,
      [stichtag],
    );
    // `bindReturningRows`, NICHT `bindRows` (s. `map-row.ts`): Das Tupel
    // [rows, rowCount] hat IMMER Laenge 2 — der Lauf meldete damit stets
    // „2 Zeilen", unabhaengig davon, wie viele er tatsaechlich angefasst hat.
    // Eine falsche Mengenangabe in einem Loeschlauf ist kein Schoenheitsfehler:
    // Sie ist der Nachweis gegenueber der Aufsicht.
    return bindReturningRows<AnzahlRow>(rows).length;
  }

  async loescheZeilen(stichtag: Date, obergrenze: Date): Promise<number> {
    const rows: unknown = await this.txHost.tx.query(
      `DELETE FROM ingest.eingang_quarantaene
        WHERE id IN (
              SELECT q.id
                FROM ingest.eingang_quarantaene q
               WHERE q.empfangen_at < $1
                 AND (q.empfangen_at < $2 OR NOT (${GEHOERT_ZU_OFFENEM_VORGANG}))
               ORDER BY q.empfangen_at ASC
               LIMIT ${BATCH_GRENZE}
        )
       RETURNING 1 AS anzahl`,
      [stichtag, obergrenze],
    );
    // `bindReturningRows`, NICHT `bindRows` (s. `map-row.ts`): Das Tupel
    // [rows, rowCount] hat IMMER Laenge 2 — der Lauf meldete damit stets
    // „2 Zeilen", unabhaengig davon, wie viele er tatsaechlich angefasst hat.
    // Eine falsche Mengenangabe in einem Loeschlauf ist kein Schoenheitsfehler:
    // Sie ist der Nachweis gegenueber der Aufsicht.
    return bindReturningRows<AnzahlRow>(rows).length;
  }
}
