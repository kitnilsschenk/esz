import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows } from '../../stammdaten/persistence/map-row';
import { toIsoDateString, toIsoDateStringOrNull } from './pg-date.util';

/**
 * Pseudonyme PROJEKTION einer `einfluss.intervall`-Zeile — GENAU die sechs
 * Spalten, die `analytics.eingang_einflussgroesse` kennt (ADR-0006 D7/A5,
 * V0019-Kommentar "Dritte Snapshot-Art ... OHNE betroffener_typ/quelle_typ/
 * rechtsgrundlage/anlass_code"). `endkundeId`/`standortId`/`betroffenerTyp`/
 * `quelleTyp`/`rechtsgrundlage`/`abwaegungRef`/`art14InformationAt`/
 * `anlassCode`/`id`/`createdAt`/`updatedAt` sind ABSICHTLICH NICHT Teil
 * dieses Typs — die Verwaltungsfelder erreichen den Namensraum `analytics`
 * so schon auf TYP-Ebene nie (nicht nur "werden nicht weitergereicht": sie
 * werden von der SQL-Projektion unten gar nicht erst SELECTed).
 */
export interface EinflussIntervallProjektionZeile {
  readonly systemId: string;
  readonly groesseCode: string;
  /** `numeric(18,3)` — als `number` zurückgegeben (Kanonisierung/Hash rundet ohnehin auf 3 Nachkommastellen, `EingangSnapshotRepository`-Konvention). */
  readonly wertNum: number | null;
  readonly wertCode: string | null;
  readonly gueltigAbMonat: string;
  readonly gueltigBisMonat: string | null;
}

interface EinflussIntervallProjektionDbRow {
  readonly system_id: string;
  readonly groesse_code: string;
  readonly wert_num: string | null;
  readonly wert_code: string | null;
  readonly gueltig_ab_monat: unknown;
  readonly gueltig_bis_monat: unknown;
}

function mapRow(row: EinflussIntervallProjektionDbRow): EinflussIntervallProjektionZeile {
  return {
    systemId: row.system_id,
    groesseCode: row.groesse_code,
    wertNum: row.wert_num === null ? null : Number.parseFloat(row.wert_num),
    wertCode: row.wert_code,
    gueltigAbMonat: toIsoDateString(row.gueltig_ab_monat),
    gueltigBisMonat: toIsoDateStringOrNull(row.gueltig_bis_monat),
  };
}

/**
 * ADR-0006 D7/A5/B7 — REIN LESENDER Zugriff auf `einfluss.intervall` für den
 * Berechnungslauf-Snapshot-Schreibpfad (`BerechnungslaufService`). Bewusst
 * EIN EIGENES, `berechnung`-eigenes Repository statt Wiederverwendung von
 * `stammdaten/persistence/einfluss/einfluss-intervall.repository.ts` (Muster
 * `AnalyticsLaufLookupRepository`/`AnalyticsExportLaufRepository`, D2/B7:
 * "eigene, modul-spezifische Queries, keine zusätzliche Kopplung an ein
 * fremdes Modul-Repository") — UND weil das `stammdaten`-Repository die
 * VOLLE Zeile inkl. aller Verwaltungsfelder liefert, während dieser
 * Lesepfad STRUKTURELL nur die sechs pseudonymen Projektionsspalten kennen
 * darf (s. `EinflussIntervallProjektionZeile`-Kommentar).
 *
 * **ACHTUNG PRODUKTIONS-ROLLOUT (dokumentiert, NICHT hier behoben):**
 * `edms_app` hat auf `einfluss.*` HEUTE keinen Grant (V0020 D-ROLLE,
 * Least-Privilege-Entscheidung: NUR `edms_einfluss` darf lesen/schreiben).
 * In Dev/Test verbindet die gesamte App über EINE globale `DataSource` als
 * DB-Owner (`DATABASE_URL`, `common/persistence/database.module.ts`, exakt
 * der bereits an anderer Stelle dokumentierte Zustand, s.
 * `NachweisExportPseudonymRepository`-Kommentar zu `edms_nachweis_renderer`)
 * — diese Query läuft daher in Dev/Test ungeachtet des fehlenden Grants.
 * Sobald `edms_app` in einer echten Umgebung NICHT mehr der Owner ist,
 * braucht dieser Zugriffspfad einen expliziten
 * `GRANT SELECT ON einfluss.intervall TO edms_app` — EIGENE Migration +
 * `compliance-director`-Freigabe (Least-Privilege-Entscheidung, nicht
 * einseitig durch `backend-lead`/`baseline-engineer` änderbar), NICHT Teil
 * dieses Pakets.
 */
@Injectable()
export class EinflussIntervallLeseRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * Lädt die zum Lauf-Zeitraum `[periodeVon, periodeBis)` gültigen
   * Intervalle der übergebenen Systeme. Overlap-Bedingung IDENTISCH zum
   * V0020-EXCLUDE-Constraint (`daterange(gueltig_ab_monat, gueltig_bis_monat)
   * WITH &&`) — ein offenes Intervall (`gueltig_bis_monat IS NULL`, "bis
   * heute gültig") überlappt jeden Zeitraum, dessen Ende nach seinem Beginn
   * liegt. Leeres `systemIds` liefert bewusst `[]` OHNE Datenbankzugriff
   * (Regelfall, solange `energy.messkonzept_version_energietraeger_system`
   * für die betreffende `mvet_id` keine Zuordnung trägt, V0028).
   */
  async findGueltigeFuerSysteme(
    systemIds: readonly string[],
    periodeVon: string,
    periodeBis: string,
  ): Promise<EinflussIntervallProjektionZeile[]> {
    if (systemIds.length === 0) {
      return [];
    }
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT system_id, groesse_code, wert_num, wert_code, gueltig_ab_monat, gueltig_bis_monat
         FROM einfluss.intervall
        WHERE system_id = ANY($1::uuid[])
          AND daterange(gueltig_ab_monat, gueltig_bis_monat) && daterange($2::date, $3::date)
        ORDER BY system_id ASC, groesse_code ASC, gueltig_ab_monat ASC`,
      [[...systemIds], periodeVon, periodeBis],
    );
    return mapManyRows(bindRows<EinflussIntervallProjektionDbRow>(rawRows), mapRow);
  }
}
