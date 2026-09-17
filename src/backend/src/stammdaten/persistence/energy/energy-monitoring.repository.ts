import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows } from '../map-row';
import { decodeCursor } from '../cursor.util';

/**
 * ADR-0008 §13/§20 (DE-02-Monitoring) — REIN `energy.*`-Aggregation
 * (KEINE PII, KEIN Verbrauchsinhalt, §6.5). Joins bleiben INNERHALB von
 * `energy.*` (erlaubt, Linie 5 verbietet nur `energy ↔ identity`).
 *
 * SCOPE-ENTSCHEIDUNG (v1, dokumentiert für Review): die Lücken-Aggregation
 * läuft auf ENDKUNDE-Ebene (`ebene='endkunde'`, roll-up über alle Systeme/
 * Zähler des Endkunden) — KEINE granularen System-/Zähler-Einzel-Einträge in
 * v1 (Aufwands-/Zeit-Scope-Reduktion, s. finale Antwort). `keine_
 * mindestaufloesungs_zusage` wird NICHT berechnet: es existiert in V0002
 * KEINE Spalte, die eine "Mindestauflösungs-Zusage" abbildet — ein
 * unbegründetes Immer-Flag wäre irreführender als ein fehlender Check
 * (offener Punkt, s. finale Antwort).
 */
export interface VollstaendigkeitRow {
  readonly endkunde_id: string;
  /**
   * `false`, wenn für den Zweck `messdaten_verarbeitung` eine Einwilligung
   * VERLANGT ist und fehlt — beim Endkunden selbst oder bei einem seiner
   * Anschlussnutzer. Siehe `EINWILLIGUNG_VOLLSTAENDIG_SQL` für die Regel und
   * für den Grund, warum hier NICHT `energy.endkunde.consent_status` steht.
   */
  readonly einwilligung_vollstaendig: boolean;
  readonly hat_messkonzept: boolean;
  readonly hat_zaehler: boolean;
  readonly hat_messkanal: boolean;
  readonly created_at: string;
}

export type LueckenTyp = 'kein_messkonzept' | 'kein_zaehler' | 'kein_messkanal' | 'kein_aktiver_consent';

export interface VollstaendigkeitEintrag {
  readonly endkundeId: string;
  readonly ebene: 'endkunde';
  readonly luecken: readonly LueckenTyp[];
  readonly createdAt: string;
}

function ermittleLuecken(row: VollstaendigkeitRow): LueckenTyp[] {
  const luecken: LueckenTyp[] = [];
  if (!row.hat_messkonzept) {
    luecken.push('kein_messkonzept');
  }
  if (!row.hat_zaehler) {
    luecken.push('kein_zaehler');
  }
  if (!row.hat_messkanal) {
    luecken.push('kein_messkanal');
  }
  if (!row.einwilligung_vollstaendig) {
    luecken.push('kein_aktiver_consent');
  }
  return luecken;
}

function mapRow(row: VollstaendigkeitRow): VollstaendigkeitEintrag {
  return { endkundeId: row.endkunde_id, ebene: 'endkunde', luecken: ermittleLuecken(row), createdAt: row.created_at };
}

export interface ListVollstaendigkeitOptions {
  readonly cursor?: string;
  readonly limit: number;
  readonly endkundeId?: string;
  readonly nurMitLuecken: boolean;
}

/**
 * Ist die Einwilligungslage dieses Endkunden vollständig?
 *
 * **Warum hier nicht `energy.endkunde.consent_status` steht.** Diese Spalte
 * ist ein SLOT aus V0002 („Mechanik = Consent-ADR"), den V0044 abgelöst hat:
 * Die Einwilligung ist seither ein EREIGNIS (`consent.einwilligung`), kein
 * Zustand am Endkunden. Den Slot füllt seitdem niemand mehr — er steht bei
 * JEDEM Endkunden dauerhaft auf `fehlt`. Die Vollständigkeitsprüfung meldete
 * deshalb bei jedem Kunden „Keine aktive Einwilligung", und zwar
 * unbehebbar: Es gab keine Eingabe, die den Befund je hätte auflösen können.
 * Ein Dauer-Alarm, den niemand abstellen kann, bringt den Bediener dazu, die
 * Kachel zu übergehen — genau die Kachel, die echte Lücken zeigen soll.
 *
 * **Was stattdessen gilt.** Die Matrix `consent.zweck_subjekt` (V0047)
 * entscheidet je (Zweck, Subjektart), OB eine Einwilligung überhaupt die
 * Grundlage ist. Für den Endkunden beruht die Messdatenverarbeitung auf
 * Art. 6 Abs. 1 lit. b (Vertragserfüllung) — da ist keine Einwilligung zu
 * holen, und ihr Fehlen ist keine Lücke. Für den ANSCHLUSSNUTZER, der nicht
 * Vertragspartei ist, beruht sie auf lit. a — dort ist das Fehlen eine echte
 * Lücke, und der Verbrauch dieses Nutzers darf nicht verarbeitet werden.
 *
 * Geprüft wird `messdaten_verarbeitung`: der Zweck, der die Kernverarbeitung
 * trägt. Zwecke wie `mehrwertdienste` sind freiwillig und dürfen die
 * Vollständigkeit einer Abrechnung nicht blockieren.
 *
 * Gelöschte oder gesperrte Anschlussnutzer zählen nicht mit: Für sie ist die
 * Verarbeitung ohnehin eingeschränkt, ihr fehlender Consent ist kein offener
 * Arbeitsauftrag.
 */
const EINWILLIGUNG_VOLLSTAENDIG_SQL = `(
  NOT EXISTS (
    SELECT 1
      FROM consent.zweck_subjekt zs
     WHERE zs.zweck_code = 'messdaten_verarbeitung'
       AND zs.subjekt_typ = 'endkunde'
       AND zs.erlaubnismodus = 'opt_in'
       AND NOT EXISTS (
         SELECT 1 FROM consent.einwilligung ew
          WHERE ew.endkunde_id = e.id
            AND ew.zweck_code = zs.zweck_code
            AND ew.widerrufen_at IS NULL
       )
  )
  AND NOT EXISTS (
    SELECT 1
      FROM energy.anschlussnutzer an
      JOIN consent.zweck_subjekt zs
        ON zs.zweck_code = 'messdaten_verarbeitung'
       AND zs.subjekt_typ = 'anschlussnutzer'
       AND zs.erlaubnismodus = 'opt_in'
     WHERE an.endkunde_id = e.id
       AND an.verarbeitungs_status = 'aktiv'
       AND NOT EXISTS (
         SELECT 1 FROM consent.einwilligung ew
          WHERE ew.anschlussnutzer_id = an.id
            AND ew.zweck_code = zs.zweck_code
            AND ew.widerrufen_at IS NULL
       )
  )
)`;

@Injectable()
export class EnergyMonitoringRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async listVollstaendigkeit(options: ListVollstaendigkeitOptions): Promise<VollstaendigkeitEintrag[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.endkundeId !== undefined) {
      params.push(options.endkundeId);
      conditions.push(`e.id = $${String(params.length)}::uuid`);
    }

    const decoded = options.cursor !== undefined ? decodeCursor(options.cursor) : undefined;
    if (decoded !== undefined) {
      params.push(decoded.createdAt, decoded.id);
      const idxA = params.length - 1;
      const idxB = params.length;
      conditions.push(
        `(e.created_at > $${String(idxA)}::timestamptz OR (e.created_at = $${String(idxA)}::timestamptz AND e.id > $${String(idxB)}::uuid))`,
      );
    }

    params.push(options.limit + 1);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const lueckenFilter = options.nurMitLuecken
      ? 'WHERE NOT hat_messkonzept OR NOT hat_zaehler OR NOT hat_messkanal OR NOT einwilligung_vollstaendig'
      : '';

    const rawRows: unknown = await this.txHost.tx.query(
      `WITH basis AS (
         SELECT
           e.id AS endkunde_id,
           ${EINWILLIGUNG_VOLLSTAENDIG_SQL} AS einwilligung_vollstaendig,
           EXISTS (SELECT 1 FROM energy.messkonzept mk WHERE mk.endkunde_id = e.id) AS hat_messkonzept,
           EXISTS (
             SELECT 1 FROM energy.system s JOIN energy.zaehler z ON z.system_id = s.id WHERE s.endkunde_id = e.id
           ) AS hat_zaehler,
           EXISTS (
             SELECT 1 FROM energy.system s
               JOIN energy.zaehler z ON z.system_id = s.id
               JOIN energy.messkanal mkn ON mkn.zaehler_id = z.id
             WHERE s.endkunde_id = e.id
           ) AS hat_messkanal,
           e.created_at
         FROM energy.endkunde e
         ${whereClause}
         ORDER BY e.created_at ASC, e.id ASC
       )
       SELECT endkunde_id, einwilligung_vollstaendig, hat_messkonzept, hat_zaehler, hat_messkanal, created_at
       FROM basis
       ${lueckenFilter}
       LIMIT $${String(params.length)}`,
      params,
    );

    return mapManyRows(bindRows<VollstaendigkeitRow>(rawRows), mapRow);
  }
}
