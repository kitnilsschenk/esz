import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindReturningRows, bindRows, mapManyRows, mapOneRow } from '../map-row';
import { toIsoDateString, toIsoDateStringOrNull, toIsoTimestampString, toIsoTimestampStringOrNull } from '../pg-date.util';

/**
 * ADR-0006 Teil B (B8/D8.2/D8.3, `migrations/V0020`) — query-basiertes
 * Repository, NUR `einfluss.intervall` (Zustands-Zeitreihe, A3/A4 der
 * Migration). `edms_einfluss` hat `SELECT, INSERT` UNBESCHRÄNKT sowie
 * `UPDATE` NUR spaltenscharf auf `(gueltig_bis_monat, updated_at)`
 * (V0020 D-UPDATE-SCOPE) — `schliessen()` unten ist daher die EINZIGE
 * UPDATE-Operation, die dieses Repository anbietet; jede fachliche
 * "Korrektur" legt STATTDESSEN eine NEUE Zeile über `insert()` an (append-
 * only, `EinflussgroesseService.korrigieren()`).
 *
 * Alle `date`-Spalten laufen durch `toIsoDateString()`/`toIsoDateStringOrNull()`
 * (s. `../pg-date.util.ts`-Kommentar — LOKALE-vs-UTC-Fallstrick), alle
 * `timestamptz`-Spalten durch `toIsoTimestampString()`/
 * `toIsoTimestampStringOrNull()` — GARANTIERT echte `string`-Werte zur
 * Laufzeit, nicht nur im TS-Typ (kritisch für den `@AuditAction`-Kontext,
 * der rohe `Date`-Objekte fail-closed ablehnt, UND für Datumsvergleiche im
 * Service).
 */
export interface EinflussIntervallRow {
  readonly id: string;
  readonly endkunde_id: string;
  readonly system_id: string;
  readonly standort_id: string | null;
  readonly groesse_code: string;
  readonly wert_num: string | null;
  readonly wert_code: string | null;
  readonly gueltig_ab_monat: unknown;
  readonly gueltig_bis_monat: unknown;
  readonly betroffener_typ: string;
  readonly quelle_typ: string;
  readonly rechtsgrundlage: string;
  readonly abwaegung_ref: string | null;
  readonly art14_information_at: unknown;
  readonly anlass_code: string | null;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

export type BetroffenerTyp = 'endkunde' | 'anschlussnutzer';
export type QuelleTyp = 'endkunde' | 'anschlussnutzer' | 'betriebsteam' | 'vor_ort';
export type Rechtsgrundlage = 'art6_1b' | 'art6_1f';

export interface EinflussIntervall {
  readonly id: string;
  readonly endkundeId: string;
  readonly systemId: string;
  readonly standortId: string | null;
  readonly groesseCode: string;
  /** `numeric(18,3)` kommt über `pg` als STRING zurück (Praezisions-Erhalt) — bewusst nicht in `number` gewandelt, s. `EinflussgroesseMapper`. */
  readonly wertNum: string | null;
  readonly wertCode: string | null;
  readonly gueltigAbMonat: string;
  readonly gueltigBisMonat: string | null;
  readonly betroffenerTyp: BetroffenerTyp;
  readonly quelleTyp: QuelleTyp;
  readonly rechtsgrundlage: Rechtsgrundlage;
  readonly abwaegungRef: string | null;
  readonly art14InformationAt: string | null;
  readonly anlassCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function toBetroffenerTyp(value: string): BetroffenerTyp {
  return value === 'anschlussnutzer' ? 'anschlussnutzer' : 'endkunde';
}

function toQuelleTyp(value: string): QuelleTyp {
  if (value === 'anschlussnutzer' || value === 'betriebsteam' || value === 'vor_ort') {
    return value;
  }
  return 'endkunde';
}

function toRechtsgrundlage(value: string): Rechtsgrundlage {
  return value === 'art6_1f' ? 'art6_1f' : 'art6_1b';
}

function mapRow(row: EinflussIntervallRow): EinflussIntervall {
  return {
    id: row.id,
    endkundeId: row.endkunde_id,
    systemId: row.system_id,
    standortId: row.standort_id,
    groesseCode: row.groesse_code,
    wertNum: row.wert_num,
    wertCode: row.wert_code,
    gueltigAbMonat: toIsoDateString(row.gueltig_ab_monat),
    gueltigBisMonat: toIsoDateStringOrNull(row.gueltig_bis_monat),
    betroffenerTyp: toBetroffenerTyp(row.betroffener_typ),
    quelleTyp: toQuelleTyp(row.quelle_typ),
    rechtsgrundlage: toRechtsgrundlage(row.rechtsgrundlage),
    abwaegungRef: row.abwaegung_ref,
    art14InformationAt: toIsoTimestampStringOrNull(row.art14_information_at),
    anlassCode: row.anlass_code,
    createdAt: toIsoTimestampString(row.created_at),
    updatedAt: toIsoTimestampString(row.updated_at),
  };
}

const SELECT_COLUMNS =
  'id, endkunde_id, system_id, standort_id, groesse_code, wert_num, wert_code, gueltig_ab_monat, ' +
  'gueltig_bis_monat, betroffener_typ, quelle_typ, rechtsgrundlage, abwaegung_ref, art14_information_at, ' +
  'anlass_code, created_at, updated_at';

export interface InsertEinflussIntervallInput {
  readonly id: string;
  readonly endkundeId: string;
  readonly systemId: string;
  readonly standortId: string | null;
  readonly groesseCode: string;
  readonly wertNum: number | null;
  readonly wertCode: string | null;
  readonly gueltigAbMonat: string;
  readonly gueltigBisMonat: string | null;
  readonly betroffenerTyp: BetroffenerTyp;
  readonly quelleTyp: QuelleTyp;
  readonly rechtsgrundlage: Rechtsgrundlage;
  readonly abwaegungRef: string | null;
  readonly art14InformationAt: string | null;
  readonly anlassCode: string | null;
}

/** PG-Fehlercode für EXCLUDE-Constraint-Verletzung (`ex_einfluss_no_overlap`, V0020) — Contract-409. */
export const PG_EXCLUSION_VIOLATION = '23P01';

@Injectable()
export class EinflussIntervallRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async insert(input: InsertEinflussIntervallInput): Promise<EinflussIntervall> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO einfluss.intervall
         (id, endkunde_id, system_id, standort_id, groesse_code, wert_num, wert_code,
          gueltig_ab_monat, gueltig_bis_monat, betroffener_typ, quelle_typ, rechtsgrundlage,
          abwaegung_ref, art14_information_at, anlass_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.id,
        input.endkundeId,
        input.systemId,
        input.standortId,
        input.groesseCode,
        input.wertNum,
        input.wertCode,
        input.gueltigAbMonat,
        input.gueltigBisMonat,
        input.betroffenerTyp,
        input.quelleTyp,
        input.rechtsgrundlage,
        input.abwaegungRef,
        input.art14InformationAt,
        input.anlassCode,
      ],
    );

    const result = mapOneRow(bindRows<EinflussIntervallRow>(rawRows), mapRow);
    if (result === undefined) {
      throw new Error('einfluss.intervall-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }

  async findById(id: string): Promise<EinflussIntervall | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM einfluss.intervall WHERE id = $1`,
      [id],
    );

    return mapOneRow(bindRows<EinflussIntervallRow>(rawRows), mapRow);
  }

  /** Das aktuell OFFENE Intervall (`gueltig_bis_monat IS NULL`) fuer (system_id, groesse_code) — hoechstens EINE Zeile (EXCLUDE-Constraint). */
  async findOffenBySystemUndGroesse(systemId: string, groesseCode: string): Promise<EinflussIntervall | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM einfluss.intervall
        WHERE system_id = $1 AND groesse_code = $2 AND gueltig_bis_monat IS NULL`,
      [systemId, groesseCode],
    );

    return mapOneRow(bindRows<EinflussIntervallRow>(rawRows), mapRow);
  }

  /**
   * Klartext-Liste je System (`read:einflussgroesse`, GET .../systeme/{id}/einflussgroessen) —
   * bewusst UNPAGINIERT (analog `EnergyStandortRepository.listByEndkunde`,
   * fachlich bounded: fuenf Katalog-Codes je System, realistische Historientiefe).
   */
  async listBySystem(systemId: string): Promise<EinflussIntervall[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT ${SELECT_COLUMNS} FROM einfluss.intervall
        WHERE system_id = $1
        ORDER BY groesse_code ASC, gueltig_ab_monat ASC`,
      [systemId],
    );

    return mapManyRows(bindRows<EinflussIntervallRow>(rawRows), mapRow);
  }

  /**
   * Schliesst ein offenes Intervall — die EINZIGE UPDATE-Operation dieses
   * Repositories (V0020 D-UPDATE-SCOPE: `edms_einfluss` darf spaltenscharf
   * NUR `gueltig_bis_monat`/`updated_at` schreiben). IDEMPOTENT-sicheres
   * WHERE-Guard (`gueltig_bis_monat IS NULL`) — ein Aufruf auf ein BEREITS
   * geschlossenes Intervall liefert `undefined` (0 Zeilen), der Service
   * behandelt das als 409 (keine erneute Schliessung ohne neue Korrektur-Zeile).
   */
  async schliessen(id: string, gueltigBisMonat: string): Promise<EinflussIntervall | undefined> {
    const rawRows: unknown = await this.txHost.tx.query(
      `UPDATE einfluss.intervall SET gueltig_bis_monat = $2
        WHERE id = $1 AND gueltig_bis_monat IS NULL
        RETURNING ${SELECT_COLUMNS}`,
      [id, gueltigBisMonat],
    );

    return mapOneRow(bindReturningRows<EinflussIntervallRow>(rawRows), mapRow);
  }
}
