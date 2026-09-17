import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import type { Erfassungsweg, Erlaubnismodus, SubjektTyp, WiderspruchItem } from '../consent.types';

interface WiderspruchRow {
  readonly id: string;
  readonly subjekt_typ: string;
  readonly subjekt_id: string;
  readonly zweck_code: string;
  readonly erlaubnismodus: string;
  readonly erklaert_at: Date;
  readonly erfassungsweg: string;
  readonly quelle_ref: string | null;
  readonly zurueckgenommen_at: Date | null;
  readonly ruecknahme_erfassungsweg: string | null;
  readonly ruecknahme_quelle_ref: string | null;
}

export interface WiderspruchAnlegenInput {
  readonly id: string;
  readonly subjektTyp: SubjektTyp;
  readonly subjektId: string;
  readonly zweckCode: string;
  readonly erlaubnismodus: Erlaubnismodus;
  readonly erklaertAt: Date;
  readonly erfassungsweg: Erfassungsweg;
  readonly quelleRef: string | undefined;
}

const SPALTEN = `id, subjekt_typ,
       COALESCE(endkunde_id, anschlussnutzer_id) AS subjekt_id,
       zweck_code, erlaubnismodus, erklaert_at, erfassungsweg, quelle_ref,
       zurueckgenommen_at, ruecknahme_erfassungsweg, ruecknahme_quelle_ref`;

/**
 * Zugriff auf `consent.widerspruch` (V0052, Auflage AW-27).
 *
 * Die Subjekt-Kennung liegt im Schema in ZWEI Spalten
 * (`endkunde_id`/`anschlussnutzer_id`), weil nur so ein Fremdschlüssel je
 * Zieltabelle möglich ist — dieselbe Konstruktion wie bei
 * `consent.einwilligung`. Nach aussen ist sie EIN Feld: Der Aufrufer
 * unterscheidet über `subjektTyp`, und ein zweites Kennungsfeld, das je nach
 * Typ leer ist, wäre eine Falle für jeden, der es liest.
 */
@Injectable()
export class WiderspruchRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  private static readonly abbilden = (row: WiderspruchRow): WiderspruchItem => {
    return {
      id: row.id,
      subjektTyp: row.subjekt_typ as SubjektTyp,
      subjektId: row.subjekt_id,
      zweckCode: row.zweck_code,
      erlaubnismodus: row.erlaubnismodus as Erlaubnismodus,
      erklaertAt: row.erklaert_at.toISOString(),
      erfassungsweg: row.erfassungsweg as Erfassungsweg,
      quelleRef: row.quelle_ref,
      zurueckgenommenAt: row.zurueckgenommen_at?.toISOString() ?? null,
      ruecknahmeErfassungsweg: (row.ruecknahme_erfassungsweg as Erfassungsweg | null) ?? null,
      ruecknahmeQuelleRef: row.ruecknahme_quelle_ref,
      // Abgeleitet, nicht gespeichert: Der Zustand folgt aus dem Ereignis,
      // nicht umgekehrt (Bauform aus ADR-0012 §2).
      wirksam: row.zurueckgenommen_at === null,
    };
  };

  async findFuerSubjekt(subjektTyp: SubjektTyp, subjektId: string): Promise<WiderspruchItem[]> {
    const spalte = subjektTyp === 'endkunde' ? 'endkunde_id' : 'anschlussnutzer_id';
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SPALTEN} FROM consent.widerspruch
        WHERE ${spalte} = $1
        ORDER BY erklaert_at DESC, id DESC`,
      [subjektId],
    );

    return mapManyRows(bindRows<WiderspruchRow>(rawRows), WiderspruchRepository.abbilden);
  }

  async findById(id: string): Promise<WiderspruchItem | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SPALTEN} FROM consent.widerspruch WHERE id = $1`,
      [id],
    );

    return mapOneRow(bindRows<WiderspruchRow>(rawRows), WiderspruchRepository.abbilden);
  }

  async insert(input: WiderspruchAnlegenInput): Promise<void> {
    const endkundeId = input.subjektTyp === 'endkunde' ? input.subjektId : null;
    const anschlussnutzerId = input.subjektTyp === 'anschlussnutzer' ? input.subjektId : null;

    await this.txHost.tx.query(
      `INSERT INTO consent.widerspruch
             (id, subjekt_typ, endkunde_id, anschlussnutzer_id, zweck_code, erlaubnismodus,
              erklaert_at, erfassungsweg, quelle_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.id,
        input.subjektTyp,
        endkundeId,
        anschlussnutzerId,
        input.zweckCode,
        input.erlaubnismodus,
        input.erklaertAt,
        input.erfassungsweg,
        input.quelleRef ?? null,
      ],
    );
  }

  /**
   * Nimmt einen wirksamen Widerspruch zurück.
   *
   * `WHERE zurueckgenommen_at IS NULL` ist die eigentliche Aussage: Eine
   * zweite Rücknahme darf den ersten Zeitpunkt nicht überschreiben, sonst
   * verschöbe sich die Angabe, ab wann wieder verarbeitet werden durfte.
   * Dieselbe Sicherung wie beim Widerruf einer Einwilligung (ADR-0012 E10).
   */
  async nimmZurueck(input: {
    readonly id: string;
    readonly zurueckgenommenAt: Date;
    readonly erfassungsweg: Erfassungsweg;
    readonly quelleRef: string | undefined;
  }): Promise<boolean> {
    const result: unknown = await this.txHost.tx.query(
      `UPDATE consent.widerspruch
          SET zurueckgenommen_at = $2, ruecknahme_erfassungsweg = $3, ruecknahme_quelle_ref = $4
        WHERE id = $1 AND zurueckgenommen_at IS NULL
        RETURNING id`,
      [input.id, input.zurueckgenommenAt, input.erfassungsweg, input.quelleRef ?? null],
    );

    // `bindReturningRows`, NICHT `bindRows` (s. `map-row.ts`): Das Tupel
    // [rows, rowCount] hat Laenge 2, der Vergleich war IMMER `false`. Die
    // Ruecknahme eines Widerspruchs meldete jedes Mal „bereits
    // zurueckgenommen" — ein Endkunde, der der Nutzerinformation
    // widersprochen hatte, konnte sie nie wieder bekommen.
    return bindReturningRows<{ readonly id: string }>(result).length === 1;
  }

  /**
   * Setzt das DE-04-Ausnahme-Attribut am Subjekt.
   *
   * **Das ist die einzige Stelle im Code, die es schreibt.** Der bisherige
   * Weg — ein Feld im Endkunden-Formular — ist mit AW-27 entfallen: Ein von
   * Hand gesetztes Flag behauptet einen Vorgang, den niemand belegen kann.
   * Die Wirkung bleibt am Attribut (ein Prüfpfad, fail-closed), aber sie
   * folgt ab jetzt der Erklärung und nie umgekehrt.
   */
  async setzeWissAuswertungAusgenommen(
    subjektTyp: SubjektTyp,
    subjektId: string,
    ausgenommen: boolean,
  ): Promise<void> {
    const tabelle = subjektTyp === 'endkunde' ? 'energy.endkunde' : 'energy.anschlussnutzer';
    await this.txHost.tx.query(
      `UPDATE ${tabelle} SET von_wiss_auswertung_ausgenommen = $2, updated_at = now() WHERE id = $1`,
      [subjektId, ausgenommen],
    );
  }

  /** `true`, wenn das Subjekt existiert — der Fremdschlüssel meldet sonst erst beim INSERT. */
  async subjektExistiert(subjektTyp: SubjektTyp, subjektId: string): Promise<boolean> {
    const tabelle = subjektTyp === 'endkunde' ? 'energy.endkunde' : 'energy.anschlussnutzer';
    const rawRows: unknown = await this.txHost.tx.query(`SELECT 1 AS treffer FROM ${tabelle} WHERE id = $1`, [
      subjektId,
    ]);

    return bindRows<{ readonly treffer: number }>(rawRows).length === 1;
  }
}
