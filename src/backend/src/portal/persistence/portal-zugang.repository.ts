import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapOneRow } from '../../stammdaten/persistence/map-row';

export type PortalZugangStatus = 'ausgegeben' | 'aktiv' | 'gesperrt';

/** Eine Zeile aus `portal.zugang` — mit den Hashes, aber ohne jeden Klartext. */
export interface PortalZugang {
  readonly id: string;
  readonly endkundeId: string;
  readonly kennung: string;
  readonly codeHash: Buffer | null;
  readonly codeGueltigBis: string | null;
  readonly passwortHash: Buffer | null;
  readonly passwortSalt: Buffer | null;
  readonly passwortAlgo: string | null;
  readonly fehlversuche: number;
  readonly gesperrtBis: string | null;
  readonly status: PortalZugangStatus;
  readonly createdAt: string;
}

interface ZugangRow {
  readonly id: string;
  readonly endkunde_id: string;
  readonly kennung: string;
  readonly code_hash: Buffer | null;
  readonly code_gueltig_bis: string | null;
  readonly passwort_hash: Buffer | null;
  readonly passwort_salt: Buffer | null;
  readonly passwort_algo: string | null;
  readonly fehlversuche: number;
  readonly gesperrt_bis: string | null;
  readonly status: string;
  readonly created_at: string;
}

const SPALTEN =
  'id, endkunde_id, kennung, code_hash, code_gueltig_bis, passwort_hash, passwort_salt, ' +
  'passwort_algo, fehlversuche, gesperrt_bis, status, created_at';

function abbilden(row: ZugangRow): PortalZugang {
  return {
    id: row.id,
    endkundeId: row.endkunde_id,
    kennung: row.kennung,
    codeHash: row.code_hash,
    codeGueltigBis: row.code_gueltig_bis,
    passwortHash: row.passwort_hash,
    passwortSalt: row.passwort_salt,
    passwortAlgo: row.passwort_algo,
    fehlversuche: row.fehlversuche,
    gesperrtBis: row.gesperrt_bis,
    status: (row.status as PortalZugangStatus | undefined) ?? 'gesperrt',
    createdAt: row.created_at,
  };
}

/**
 * `portal.zugang` (V0066/V0068) — der Endkunden-Zugang zum Nutzerportal.
 *
 * `edms_app` hat SELECT/INSERT/UPDATE, KEIN DELETE: Ein Zugang wird gesperrt,
 * nicht gelöscht — sonst wäre nachträglich nicht mehr zu belegen, dass ein
 * Kunde einen hatte.
 */
@Injectable()
export class PortalZugangRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async findByEndkundeId(endkundeId: string): Promise<PortalZugang | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SPALTEN} FROM portal.zugang WHERE endkunde_id = $1`,
      [endkundeId],
    );
    return mapOneRow(bindRows<ZugangRow>(rawRows), abbilden);
  }

  /**
   * Sucht über den deterministischen Code-Index.
   *
   * Bewusst OHNE Ablaufprüfung im SQL: Ein abgelaufener Code soll gefunden
   * und als „abgelaufen" beantwortet werden. Filterte die Abfrage ihn weg,
   * wäre er von einem falschen Code nicht zu unterscheiden — und der Kunde
   * bekäme „Code ungültig" für einen Code, der schlicht zu alt ist.
   */
  async findByCodeIndex(codeHash: Buffer): Promise<PortalZugang | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SPALTEN} FROM portal.zugang WHERE code_hash = $1`,
      [codeHash],
    );
    return mapOneRow(bindRows<ZugangRow>(rawRows), abbilden);
  }

  async findByKennung(kennung: string): Promise<PortalZugang | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SPALTEN} FROM portal.zugang WHERE kennung = $1`,
      [kennung],
    );
    return mapOneRow(bindRows<ZugangRow>(rawRows), abbilden);
  }

  async insert(input: {
    readonly id: string;
    readonly endkundeId: string;
    readonly kennung: string;
    readonly codeHash: Buffer;
    readonly codeGueltigBis: Date;
  }): Promise<PortalZugang> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO portal.zugang (id, endkunde_id, kennung, code_hash, code_gueltig_bis, code_ausgegeben_at, status)
       VALUES ($1, $2, $3, $4, $5, now(), 'ausgegeben')
       RETURNING ${SPALTEN}`,
      [input.id, input.endkundeId, input.kennung, input.codeHash, input.codeGueltigBis],
    );
    const zugang = mapOneRow(bindRows<ZugangRow>(rawRows), abbilden);
    if (zugang === undefined) {
      throw new Error('portal.zugang-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }
    return zugang;
  }

  /**
   * Gibt einem BESTEHENDEN Zugang einen neuen Code.
   *
   * Ein gesetztes Passwort bleibt unangetastet: Der neue Code ist ein
   * Ersatzbrief, kein Zurücksetzen. Wer sein Passwort vergessen hat, braucht
   * den Weg über `setzePasswort` — und der beginnt mit dem Einlösen des
   * neuen Codes.
   */
  async neuerCode(id: string, codeHash: Buffer, codeGueltigBis: Date): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE portal.zugang
          SET code_hash = $2, code_gueltig_bis = $3, code_ausgegeben_at = now(),
              fehlversuche = 0, gesperrt_bis = NULL
        WHERE id = $1 AND status <> 'gesperrt'
        RETURNING id`,
      [id, codeHash, codeGueltigBis],
    );
    return bindReturningRows<{ readonly id: string }>(rawRows).length === 1;
  }

  /**
   * Löst den Code ein: Passwort setzen, Code verbrauchen, Zugang aktivieren.
   *
   * `code_hash = NULL` ist der eigentliche Vorgang — ab hier ist der Brief
   * wertlos. Die Bedingung `code_hash IS NOT NULL` macht das Einlösen
   * einmalig, auch wenn zwei Anfragen gleichzeitig ankommen.
   */
  async setzePasswort(
    id: string,
    passwort: { readonly hash: Buffer; readonly salt: Buffer; readonly algo: string },
  ): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE portal.zugang
          SET passwort_hash = $2, passwort_salt = $3, passwort_algo = $4, passwort_gesetzt_at = now(),
              code_hash = NULL, code_gueltig_bis = NULL, code_ausgegeben_at = NULL,
              status = 'aktiv', fehlversuche = 0, gesperrt_bis = NULL
        WHERE id = $1 AND code_hash IS NOT NULL AND status <> 'gesperrt'
        RETURNING id`,
      [id, passwort.hash, passwort.salt, passwort.algo],
    );
    return bindReturningRows<{ readonly id: string }>(rawRows).length === 1;
  }

  /** Leitet ein bestehendes Passwort auf stärkere Parameter um (nach erfolgreicher Anmeldung). */
  async aktualisierePasswort(
    id: string,
    passwort: { readonly hash: Buffer; readonly salt: Buffer; readonly algo: string },
  ): Promise<void> {
    await this.txHost.tx.query(
      `UPDATE portal.zugang
          SET passwort_hash = $2, passwort_salt = $3, passwort_algo = $4, passwort_gesetzt_at = now()
        WHERE id = $1`,
      [id, passwort.hash, passwort.salt, passwort.algo],
    );
  }

  /** Zählt einen Fehlversuch und sperrt ab der Grenze für eine Weile. */
  async vermerkeFehlversuch(id: string, grenze: number, sperrdauerSekunden: number): Promise<void> {
    await this.txHost.tx.query(
      `UPDATE portal.zugang
          SET fehlversuche = fehlversuche + 1,
              gesperrt_bis = CASE
                WHEN fehlversuche + 1 >= $2 THEN now() + make_interval(secs => $3)
                ELSE gesperrt_bis
              END
        WHERE id = $1`,
      [id, grenze, sperrdauerSekunden],
    );
  }

  async setzeFehlversucheZurueck(id: string): Promise<void> {
    await this.txHost.tx.query(
      `UPDATE portal.zugang SET fehlversuche = 0, gesperrt_bis = NULL WHERE id = $1`,
      [id],
    );
  }

  /**
   * Sperrt einen Zugang dauerhaft.
   *
   * Kein Selbstheilungs-Zustand: Aus `gesperrt` führt nur ein neuer Vorgang
   * des Betriebs heraus. Ein Zugang, der sich nach Ablauf einer Frist selbst
   * entsperrt, wäre keine Sperre.
   */
  async sperre(id: string): Promise<boolean> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE portal.zugang
          SET status = 'gesperrt', code_hash = NULL, code_gueltig_bis = NULL, code_ausgegeben_at = NULL
        WHERE id = $1 AND status <> 'gesperrt'
        RETURNING id`,
      [id],
    );
    return bindReturningRows<{ readonly id: string }>(rawRows).length === 1;
  }
}
