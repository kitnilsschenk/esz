import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows } from '../map-row';

interface FristRow {
  readonly subjekt_typ: string;
  readonly subjekt_id: string;
  readonly endkunde_id: string;
  readonly einschraenkung_grund_code: string;
  readonly gesperrt_seit: string;
  readonly tage_offen: number;
}

interface ErhebungsRow {
  readonly subjekt_typ: string;
  readonly subjekt_id: string;
  readonly endkunde_id: string;
  readonly einschraenkung_grund_code: string;
  readonly gesperrt_seit: string;
  readonly tage_offen: number;
  readonly neuerhebung_fortsetzen: boolean | null;
}

export interface ErhebungsEntscheidungZeile {
  readonly subjektTyp: 'endkunde' | 'anschlussnutzer';
  readonly subjektId: string;
  readonly endkundeId: string;
  readonly einschraenkungGrundCode: string;
  readonly gesperrtSeit: string;
  readonly tageOffen: number;
  /** `null` = die Entscheidung steht noch aus (Bestandszeile aus der Zeit vor V0087). */
  readonly neuerhebungFortsetzen: boolean | null;
}

export interface EinschraenkungFristZeile {
  readonly subjektTyp: 'endkunde' | 'anschlussnutzer';
  readonly subjektId: string;
  /** Bezugs-Endkunde — beim Endkunden er selbst, beim Anschlussnutzer sein Endkunde (Einstieg fuer die Sachbearbeitung). */
  readonly endkundeId: string;
  readonly einschraenkungGrundCode: string;
  readonly gesperrtSeit: string;
  readonly tageOffen: number;
}

/**
 * Wiedervorlage fuer die BEFRISTETEN Art.-18-Tatbestaende (ADR-0007 A11.11).
 *
 * Die Abfrage ist bewusst eine UNION ueber beide Subjekttabellen statt zweier
 * getrennter Aufrufe: die Wiedervorlage ist EINE Arbeitsliste, und ein
 * ueberfaelliger Anschlussnutzer ist fuer die Sachbearbeitung genauso
 * dringlich wie ein ueberfaelliger Endkunde. Zwei Listen wuerden zwei
 * Gewohnheiten erzeugen und eine davon wuerde seltener gelesen.
 *
 * KEIN PII-Zugriff: die Zeilen tragen ausschliesslich Pseudonym-UUIDs, den
 * geschlossenen Grund-Code und Zeitangaben. Die Liste ist damit auch fuer
 * `compliance-auditor` unbedenklich — und fuer den gerade wertvoll: die
 * Frage „laeuft hier eine Einschraenkung stillschweigend weiter?" ist eine
 * Aufsichtsfrage.
 */
@Injectable()
export class EnergyEinschraenkungFristRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * Alle Einschraenkungen mit einem der uebergebenen Gruende, sortiert nach
   * Dringlichkeit (aelteste zuerst).
   *
   * `tage_offen` wird in der DATENBANK gerechnet, nicht in der Anwendung:
   * `gesperrt_seit` ist `timestamptz`, und die Differenz zu `now()` gehoert
   * dorthin, wo beide Werte dieselbe Zeitbasis haben. Eine Berechnung im
   * Node-Prozess haenge an dessen Uhr und Zeitzone.
   *
   * Die Grund-Codes kommen als Parameter (nicht als Literal im SQL), damit
   * die Auswahl der befristeten Tatbestaende an EINER Stelle steht
   * (`einschraenkung-frist.constants.ts`) und nicht zwischen Konstante und
   * Query auseinanderlaufen kann.
   */
  async findOffeneFristen(gruende: readonly string[]): Promise<EinschraenkungFristZeile[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT 'endkunde' AS subjekt_typ,
              e.id       AS subjekt_id,
              e.id       AS endkunde_id,
              e.einschraenkung_grund_code,
              e.gesperrt_seit,
              (EXTRACT(EPOCH FROM (now() - e.gesperrt_seit)) / 86400)::int AS tage_offen
         FROM energy.endkunde e
        WHERE e.verarbeitungs_status = 'gesperrt'
          AND e.gesperrt_seit IS NOT NULL
          AND e.einschraenkung_grund_code = ANY($1::text[])
        UNION ALL
       SELECT 'anschlussnutzer' AS subjekt_typ,
              a.id              AS subjekt_id,
              a.endkunde_id,
              a.einschraenkung_grund_code,
              a.gesperrt_seit,
              (EXTRACT(EPOCH FROM (now() - a.gesperrt_seit)) / 86400)::int AS tage_offen
         FROM energy.anschlussnutzer a
        WHERE a.verarbeitungs_status = 'gesperrt'
          AND a.gesperrt_seit IS NOT NULL
          AND a.einschraenkung_grund_code = ANY($1::text[])
        ORDER BY gesperrt_seit ASC`,
      [gruende],
    );

    return mapManyRows(bindRows<FristRow>(rawRows), (row) => ({
      subjektTyp: row.subjekt_typ === 'anschlussnutzer' ? 'anschlussnutzer' : 'endkunde',
      subjektId: row.subjekt_id,
      endkundeId: row.endkunde_id,
      einschraenkungGrundCode: row.einschraenkung_grund_code,
      gesperrtSeit: row.gesperrt_seit,
      tageOffen: Number(row.tage_offen),
    }));
  }

  /**
   * Auflage C-8 — alle bestehenden Einschraenkungen mit Sperrgrund lit. b
   * oder lit. d, samt der Entscheidung ueber die WEITERE ERHEBUNG.
   *
   * Warum das eine EIGENE Abfrage ist und nicht `findOffeneFristen()` mit
   * anderen Gruenden: Die Wiedervorlage der befristeten Tatbestaende fragt
   * „laeuft diese Einschraenkung laenger als vorgesehen?". Diese hier fragt
   * etwas anderes — „wirkt hier eine Entscheidung ueber die Messung, und hat
   * sie jemand getroffen?". Die Schnittmenge der Gruende ist zufaellig
   * (lit. d), die Fragen sind es nicht. Eine gemeinsame Liste haette die
   * Sachbearbeitung gezwungen, in jeder Zeile erst zu klaeren, worum es
   * gerade geht.
   *
   * Gruende als Parameter, aus demselben Grund wie oben: die Liste steht in
   * `sperr-entscheidung.util.ts` und soll nicht zwischen Konstante und Query
   * auseinanderlaufen.
   *
   * KEIN PII-Zugriff -- nur Pseudonym-UUIDs, Grund-Code, Zeit und ein
   * boolean.
   */
  async findErhebungsEntscheidungen(gruende: readonly string[]): Promise<ErhebungsEntscheidungZeile[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT 'endkunde' AS subjekt_typ,
              e.id       AS subjekt_id,
              e.id       AS endkunde_id,
              e.einschraenkung_grund_code,
              e.gesperrt_seit,
              (EXTRACT(EPOCH FROM (now() - e.gesperrt_seit)) / 86400)::int AS tage_offen,
              e.neuerhebung_fortsetzen
         FROM energy.endkunde e
        WHERE e.verarbeitungs_status = 'gesperrt'
          AND e.gesperrt_seit IS NOT NULL
          AND e.einschraenkung_grund_code = ANY($1::text[])
        UNION ALL
       SELECT 'anschlussnutzer' AS subjekt_typ,
              a.id              AS subjekt_id,
              a.endkunde_id,
              a.einschraenkung_grund_code,
              a.gesperrt_seit,
              (EXTRACT(EPOCH FROM (now() - a.gesperrt_seit)) / 86400)::int AS tage_offen,
              a.neuerhebung_fortsetzen
         FROM energy.anschlussnutzer a
        WHERE a.verarbeitungs_status = 'gesperrt'
          AND a.gesperrt_seit IS NOT NULL
          AND a.einschraenkung_grund_code = ANY($1::text[])
        -- Offene Entscheidungen zuerst, dann die gestoppten, dann der Rest;
        -- innerhalb jeder Gruppe die aeltesten voran. Die Reihenfolge ist die
        -- Dringlichkeit: eine unentschiedene Sperre ist der schlechteste
        -- Zustand, eine gestoppte Erhebung der teuerste.
        ORDER BY neuerhebung_fortsetzen NULLS FIRST, gesperrt_seit ASC`,
      [gruende],
    );

    return mapManyRows(bindRows<ErhebungsRow>(rawRows), (row) => ({
      subjektTyp: row.subjekt_typ === 'anschlussnutzer' ? 'anschlussnutzer' : 'endkunde',
      subjektId: row.subjekt_id,
      endkundeId: row.endkunde_id,
      einschraenkungGrundCode: row.einschraenkung_grund_code,
      gesperrtSeit: row.gesperrt_seit,
      tageOffen: row.tage_offen,
      neuerhebungFortsetzen: row.neuerhebung_fortsetzen,
    }));
  }
}
