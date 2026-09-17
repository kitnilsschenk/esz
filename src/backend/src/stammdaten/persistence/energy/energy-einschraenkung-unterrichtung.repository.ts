import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapOneRow } from '../map-row';

/** Geschlossene Liste `energy.einschraenkung_unterrichtung.kanal` (V0035, per CHECK erzwungen). */
export const UNTERRICHTUNG_KANAELE = ['postalisch', 'elektronisch', 'telefonisch', 'persoenlich'] as const;
export type UnterrichtungKanal = (typeof UNTERRICHTUNG_KANAELE)[number];

export function isUnterrichtungKanal(wert: string): wert is UnterrichtungKanal {
  return (UNTERRICHTUNG_KANAELE as readonly string[]).includes(wert);
}

interface UnterrichtungRow {
  readonly id: string;
  readonly endkunde_id: string | null;
  readonly anschlussnutzer_id: string | null;
  readonly gesperrt_seit: string;
  readonly unterrichtet_am: string;
  readonly kanal: string;
  readonly unterrichtet_von_sub: string;
}

export interface EinschraenkungUnterrichtung {
  readonly id: string;
  readonly endkundeId: string | null;
  readonly anschlussnutzerId: string | null;
  readonly gesperrtSeit: string;
  readonly unterrichtetAm: string;
  readonly kanal: string;
  readonly unterrichtetVonSub: string;
}

/**
 * Das Subjekt eines Unterrichtungs-Vorgangs — genau EINES der beiden Felder
 * ist gesetzt (DB-seitig erzwungen durch
 * `ck_einschr_unterrichtung_genau_ein_subjekt`, V0035).
 */
export type UnterrichtungSubjekt =
  | { readonly endkundeId: string; readonly anschlussnutzerId?: undefined }
  | { readonly anschlussnutzerId: string; readonly endkundeId?: undefined };

function mapRow(row: UnterrichtungRow): EinschraenkungUnterrichtung {
  return {
    id: row.id,
    endkundeId: row.endkunde_id,
    anschlussnutzerId: row.anschlussnutzer_id,
    gesperrtSeit: row.gesperrt_seit,
    unterrichtetAm: row.unterrichtet_am,
    kanal: row.kanal,
    unterrichtetVonSub: row.unterrichtet_von_sub,
  };
}

const SELECT_COLUMNS =
  'id, endkunde_id, anschlussnutzer_id, gesperrt_seit, unterrichtet_am, kanal, unterrichtet_von_sub';

/**
 * Nachweis der Unterrichtung nach Art. 18 Abs. 3 DSGVO (V0035, ADR-0007
 * A11.7/A11.10) — Schritt 1 des zweistufigen Entsperr-Vorgangs.
 *
 * Bewusst EIN Repository fuer beide Subjektarten: es ist EINE Tabelle mit
 * einem exklusiven Bogen (genau ein Fremdschluessel gesetzt), und der
 * Vorgang ist fuer Endkunde und Anschlussnutzer identisch. Zwei Repositories
 * waeren zwei Wege zu denselben Zeilen.
 */
@Injectable()
export class EnergyEinschraenkungUnterrichtungRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: {
    readonly id: string;
    readonly subjekt: UnterrichtungSubjekt;
    readonly gesperrtSeit: string;
    readonly kanal: UnterrichtungKanal;
    readonly unterrichtetVonSub: string;
  }): Promise<EinschraenkungUnterrichtung> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO energy.einschraenkung_unterrichtung
         (id, endkunde_id, anschlussnutzer_id, gesperrt_seit, kanal, unterrichtet_von_sub)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.id,
        input.subjekt.endkundeId ?? null,
        input.subjekt.anschlussnutzerId ?? null,
        input.gesperrtSeit,
        input.kanal,
        input.unterrichtetVonSub,
      ],
    );

    const result = mapOneRow(bindRows<UnterrichtungRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error(
        'energy.einschraenkung_unterrichtung-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.',
      );
    }

    return result;
  }

  /**
   * Der fail-closed-Check fuer Schritt 2. Sucht den Nachweis, der an GENAU
   * DIESE Einschraenkung gebunden ist — die Gleichheit auf `gesperrt_seit` ist
   * das Wesentliche: ohne sie wuerde eine Unterrichtung aus einer FRUEHEREN
   * Einschraenkung desselben Subjekts eine SPAETERE aufsperren (Subjekte
   * koennen mehrfach nacheinander eingeschraenkt werden).
   */
  async findFuerSperre(
    subjekt: UnterrichtungSubjekt,
    gesperrtSeit: string,
  ): Promise<EinschraenkungUnterrichtung | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM energy.einschraenkung_unterrichtung
        WHERE gesperrt_seit = $1
          AND endkunde_id IS NOT DISTINCT FROM $2
          AND anschlussnutzer_id IS NOT DISTINCT FROM $3`,
      [gesperrtSeit, subjekt.endkundeId ?? null, subjekt.anschlussnutzerId ?? null],
    );

    return mapOneRow(bindRows<UnterrichtungRow>(rawRows), mapRow);
  }
}
