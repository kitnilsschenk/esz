import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapOneRow } from '../../stammdaten/persistence/map-row';

/** Eine OFFENE, noch gültige Sitzung samt dem Zugang, zu dem sie gehört. */
export interface PortalSitzungMitZugang {
  readonly sitzungId: string;
  readonly zugangId: string;
  readonly endkundeId: string;
  readonly kennung: string;
  readonly zugangStatus: string;
  readonly laeuftAbAt: string;
}

interface SitzungRow {
  readonly sitzung_id: string;
  readonly zugang_id: string;
  readonly endkunde_id: string;
  readonly kennung: string;
  readonly zugang_status: string;
  readonly laeuft_ab_at: string;
}

/**
 * `portal.sitzung` (V0066) — die angemeldeten Portal-Sitzungen.
 *
 * Das Token liegt beim Kunden im `__Host-`-Cookie und hier NUR als SHA-256:
 * Ein Datenbankleser darf sich damit nicht anmelden können. Beendete
 * Sitzungen bleiben stehen (append-only-Linie) — `edms_app` hat kein DELETE.
 */
@Injectable()
export class PortalSitzungRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: {
    readonly id: string;
    readonly zugangId: string;
    readonly tokenHash: Buffer;
    readonly laeuftAbAt: Date;
  }): Promise<void> {
    await this.txHost.tx.query(
      `INSERT INTO portal.sitzung (id, zugang_id, token_hash, laeuft_ab_at) VALUES ($1, $2, $3, $4)`,
      [input.id, input.zugangId, input.tokenHash, input.laeuftAbAt],
    );
  }

  /**
   * Löst ein Sitzungs-Token auf — nur offen UND nicht abgelaufen UND der
   * Zugang nicht gesperrt.
   *
   * Die drei Bedingungen stehen bewusst im SQL und nicht im Service: Eine
   * Sitzung, die nach dem Sperren des Zugangs noch trägt, wäre genau die
   * Lücke, wegen der man sperrt. Sie hier zu vergessen ist schwerer als in
   * einer Kette von `if`-Zweigen.
   */
  async findeOffene(tokenHash: Buffer): Promise<PortalSitzungMitZugang | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT s.id AS sitzung_id, z.id AS zugang_id, z.endkunde_id, z.kennung,
              z.status AS zugang_status, s.laeuft_ab_at
         FROM portal.sitzung s
         JOIN portal.zugang z ON z.id = s.zugang_id
        WHERE s.token_hash = $1
          AND s.beendet_at IS NULL
          AND s.laeuft_ab_at > now()
          AND z.status = 'aktiv'`,
      [tokenHash],
    );
    return mapOneRow(bindRows<SitzungRow>(rawRows), (row) => ({
      sitzungId: row.sitzung_id,
      zugangId: row.zugang_id,
      endkundeId: row.endkunde_id,
      kennung: row.kennung,
      zugangStatus: row.zugang_status,
      laeuftAbAt: row.laeuft_ab_at,
    }));
  }

  /** Beendet EINE Sitzung (Abmeldung). Idempotent — eine bereits beendete bleibt, wie sie ist. */
  async beende(tokenHash: Buffer, grund: string): Promise<void> {
    await this.txHost.tx.query(
      `UPDATE portal.sitzung SET beendet_at = now(), beendet_grund = $2
        WHERE token_hash = $1 AND beendet_at IS NULL`,
      [tokenHash, grund],
    );
  }

  /**
   * Beendet ALLE offenen Sitzungen eines Zugangs.
   *
   * Gehört zum Sperren und zum Setzen eines neuen Passworts: Sonst bliebe
   * jemand angemeldet, dem gerade der Zugang entzogen wurde — und das
   * Sperren wäre eine Ankündigung statt einer Maßnahme.
   */
  async beendeAlleFuerZugang(zugangId: string, grund: string): Promise<number> {
    const ergebnis: unknown = await this.txHost.tx.query(
      `UPDATE portal.sitzung SET beendet_at = now(), beendet_grund = $2
        WHERE zugang_id = $1 AND beendet_at IS NULL
        RETURNING id`,
      [zugangId, grund],
    );
    // `bindReturningRows`, NICHT `bindRows`: TypeORM liefert für UPDATE ein
    // Tupel `[rows, rowCount]` (s. `map-row.ts`-Kopf). Mit `bindRows` wäre
    // die Zahl immer 2 — und die Protokollzeile eine Falschaussage.
    return bindReturningRows<{ readonly id: string }>(ergebnis).length;
  }
}
