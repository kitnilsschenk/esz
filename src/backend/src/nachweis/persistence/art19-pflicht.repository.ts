import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../../stammdaten/persistence/map-row';

/** Geschlossene Liste `nachweis.art19_mitteilung.anlass` (V0037). */
export const ART19_ANLAESSE = ['einschraenkung_art18', 'loeschung_art17'] as const;
export type Art19Anlass = (typeof ART19_ANLAESSE)[number];

interface PflichtRow {
  readonly einreichung_id: string;
  readonly empfaenger: string;
  readonly uebermittelt_at: string;
  readonly subjekt_typ: string;
  readonly subjekt_id: string;
  readonly anlass: string;
  readonly mitgeteilt_am: string | null;
}

export interface Art19PflichtZeile {
  readonly einreichungId: string;
  readonly empfaenger: string;
  readonly uebermitteltAt: string;
  readonly subjektTyp: 'endkunde' | 'anschlussnutzer';
  readonly subjektId: string;
  readonly anlass: Art19Anlass;
  /** `null` = Pflicht offen; sonst der Zeitpunkt der dokumentierten Mitteilung. */
  readonly mitgeteiltAm: string | null;
}

interface MitteilungRow {
  readonly id: string;
}

/**
 * Register der Art.-19-Mitteilungspflichten (ADR-0007 A18/A11.12).
 *
 * A18 benennt das Register woertlich: `nachweis.einreichung` ×
 * `einsparlauf_bindung`. Genau diese Verknuepfung beantwortet die Frage, die
 * Art. 19 stellt — „welchem Empfaenger wurden die Daten DIESER Person bereits
 * offengelegt?".
 *
 * Der ENDKUNDE steht direkt in der Bindung. Der ANSCHLUSSNUTZER nicht: seine
 * Verbrauchsdaten fliessen ueber die Kette Nutzungsverhaeltnis -> System ->
 * `messkonzept_version_energietraeger_system` -> `berechnungslauf`, und die
 * Bindung fuehrt den Berechnungslauf mit. Dieselbe Kette, die der Preflight
 * fuer FJ-11 nutzt (ADR-0006 P4 / ADR-0007 A12) — hier nur in die andere
 * Richtung gelesen.
 */
@Injectable()
export class Art19PflichtRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * Alle Mitteilungspflichten — offene wie erfuellte. Der Aufrufer filtert;
   * eine erfuellte Pflicht sichtbar zu lassen ist wertvoll, weil sie der
   * Beleg ist.
   *
   * Eine Pflicht entsteht, wenn ein Subjekt eingeschraenkt (`gesperrt`) oder
   * geloescht (`geloescht`, Krypto-Shred vollzogen) ist UND in mindestens
   * einer bereits uebermittelten Einreichung steckt. Der `anlass` leitet sich
   * aus dem Status ab — beide loesen Art. 19 aus.
   */
  async findPflichten(): Promise<Art19PflichtZeile[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `WITH betroffene_endkunden AS (
         SELECT DISTINCT
                ein.id                AS einreichung_id,
                ein.empfaenger,
                ein.uebermittelt_at,
                'endkunde'::text      AS subjekt_typ,
                e.id                  AS subjekt_id,
                CASE e.verarbeitungs_status
                  WHEN 'gesperrt'  THEN 'einschraenkung_art18'
                  ELSE                  'loeschung_art17'
                END                   AS anlass
           FROM nachweis.einreichung ein
           JOIN nachweis.einsparlauf_bindung b ON b.einsparlauf_id = ein.einsparlauf_id
           JOIN energy.endkunde e                ON e.id = b.endkunde_id
          WHERE e.verarbeitungs_status IN ('gesperrt', 'geloescht')
       ),
       betroffene_anschlussnutzer AS (
         SELECT DISTINCT
                ein.id                    AS einreichung_id,
                ein.empfaenger,
                ein.uebermittelt_at,
                'anschlussnutzer'::text   AS subjekt_typ,
                an.id                     AS subjekt_id,
                CASE an.verarbeitungs_status
                  WHEN 'gesperrt'  THEN 'einschraenkung_art18'
                  ELSE                  'loeschung_art17'
                END                       AS anlass
           FROM nachweis.einreichung ein
           JOIN nachweis.einsparlauf_bindung b   ON b.einsparlauf_id = ein.einsparlauf_id
           JOIN analytics.berechnungslauf bl     ON bl.id = b.berechnungslauf_id
           JOIN energy.messkonzept_version_energietraeger_system mvs ON mvs.mvet_id = bl.mvet_id
           JOIN energy.nutzungsverhaeltnis nv    ON nv.system_id = mvs.system_id
           JOIN energy.anschlussnutzer an        ON an.id = nv.anschlussnutzer_id
          WHERE an.verarbeitungs_status IN ('gesperrt', 'geloescht')
       ),
       alle AS (
         SELECT * FROM betroffene_endkunden
         UNION ALL
         SELECT * FROM betroffene_anschlussnutzer
       )
       SELECT a.einreichung_id,
              a.empfaenger,
              a.uebermittelt_at,
              a.subjekt_typ,
              a.subjekt_id,
              a.anlass,
              m.mitgeteilt_am
         FROM alle a
         LEFT JOIN nachweis.art19_mitteilung m
                ON m.einreichung_id = a.einreichung_id
               AND m.anlass = a.anlass
               AND ((a.subjekt_typ = 'endkunde'        AND m.endkunde_id        = a.subjekt_id)
                 OR (a.subjekt_typ = 'anschlussnutzer' AND m.anschlussnutzer_id = a.subjekt_id))
        ORDER BY a.uebermittelt_at ASC, a.subjekt_id ASC`,
      [],
    );

    return mapManyRows(bindRows<PflichtRow>(rawRows), (row) => ({
      einreichungId: row.einreichung_id,
      empfaenger: row.empfaenger,
      uebermitteltAt: row.uebermittelt_at,
      subjektTyp: row.subjekt_typ === 'anschlussnutzer' ? 'anschlussnutzer' : 'endkunde',
      subjektId: row.subjekt_id,
      anlass: row.anlass === 'loeschung_art17' ? 'loeschung_art17' : 'einschraenkung_art18',
      mitgeteiltAm: row.mitgeteilt_am,
    }));
  }

  /** Dokumentiert die erfolgte Mitteilung (Beleg, unveraenderlich). */
  async insertMitteilung(input: {
    readonly id: string;
    readonly einreichungId: string;
    readonly subjektTyp: 'endkunde' | 'anschlussnutzer';
    readonly subjektId: string;
    readonly anlass: Art19Anlass;
    readonly kanal: string;
    readonly mitgeteiltVonSub: string;
  }): Promise<string> {
    const rawRows: unknown = await this.txHost.tx.query(
      `INSERT INTO nachweis.art19_mitteilung
         (id, einreichung_id, endkunde_id, anschlussnutzer_id, anlass, kanal, mitgeteilt_von_sub)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.id,
        input.einreichungId,
        input.subjektTyp === 'endkunde' ? input.subjektId : null,
        input.subjektTyp === 'anschlussnutzer' ? input.subjektId : null,
        input.anlass,
        input.kanal,
        input.mitgeteiltVonSub,
      ],
    );

    const result = mapOneRow(bindRows<MitteilungRow>(rawRows), (row) => row.id);
    if (result === undefined) {
      throw new Error('nachweis.art19_mitteilung-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return result;
  }
}
