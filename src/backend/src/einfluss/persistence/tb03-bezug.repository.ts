import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';

/**
 * Die `energy`-Seite des Erkennungslaufs: WELCHE Systeme geprüft werden und
 * gegen WELCHEN Monat.
 *
 * WARUM ÜBER DIE APP-VERBINDUNG (A17, Weg 1). `edms_einfluss_erkennung` hat
 * bewusst keinerlei Rechte auf `energy.*` — die Namensraum-Trennung aus
 * V0020 (D-ROLLE) bleibt unangetastet. Der Lauf hält deshalb zwei
 * Verbindungen, statt eine Grenze aufzuweichen: Stammdaten hier, Klartext-
 * Einflussgrößen dort. Das Votum hat den bequemeren Weg (ein zusätzliches
 * SELECT-Grant quer über die Grenze) ausdrücklich als nachrangig eingestuft,
 * weil es nicht bei einem Grant geblieben wäre — der Sperrfilter und die
 * mvet-Auflösung hätten zwei weitere gebraucht.
 */

export interface Tb03SystemBezug {
  readonly systemId: string;
  /** Monatserster des Monats, in dem der Baseline-Erhebungszeitraum endete. */
  readonly ankerMonat: string;
}

interface BezugRow {
  readonly system_id: string;
  readonly anker_monat: string | null;
}

@Injectable()
export class Tb03BezugRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * Systeme aktiver Endkunden samt Ankermonat.
   *
   * A18 (Sperr- und Shred-Vorfilter): NUR Endkunden mit
   * `verarbeitungs_status = 'aktiv'`. Gesperrte (Art. 18), geschredderte und
   * gelöschte bleiben draußen — `einfluss.*` überlebt den Endkunden-Shred
   * zwar bewusst (V0020), aber die Aufbewahrung ist NACHWEIS-gebunden, nicht
   * ÜBERWACHUNGS-gebunden: Ein neuer Befund für einen gesperrten Endkunden
   * wäre Verarbeitung über den Zweck hinaus. Präzedenz ist A10, das
   * `create:berechnungslauf` an derselben Bedingung blockt.
   *
   * ANKERMONAT: `energy.baseline_periode.bis` ist EXKLUSIV — der Rechenkern
   * filtert `tag >= von AND tag < bis` (`berechnungslauf.service.ts`). Der
   * letzte Tag der Periode ist damit `bis - 1 Tag`, und dessen Monat ist der
   * Anker. Ohne diesen Abzug läge der Anker bei einer Periode, die am
   * Monatsersten endet, einen Monat zu spät — und der Erkennungslauf
   * vergliche gegen einen Wert, der schon zur Änderung gehört.
   *
   * Systeme ohne Baseline-Periode kommen mit `anker_monat = NULL` zurück und
   * werden vom Aufrufer als Skip ausgewiesen (A16: kein Anker, kein Befund,
   * kein Rückfall auf das Vorintervall).
   */
  async ladeSystemBezuege(): Promise<{
    readonly bezuege: readonly Tb03SystemBezug[];
    readonly ohneAnker: readonly string[];
  }> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT s.id::text AS system_id,
              to_char(date_trunc('month', max(bp.bis) - interval '1 day'), 'YYYY-MM-DD') AS anker_monat
         FROM energy.system s
         JOIN energy.endkunde e
           ON e.id = s.endkunde_id
          AND e.verarbeitungs_status = 'aktiv'
         LEFT JOIN energy.messkonzept_version_energietraeger_system mvets
           ON mvets.system_id = s.id
         LEFT JOIN energy.baseline_periode bp
           ON bp.mvet_id = mvets.mvet_id
        GROUP BY s.id
        ORDER BY s.id`,
    );

    const rows = rawRows as BezugRow[];
    const bezuege: Tb03SystemBezug[] = [];
    const ohneAnker: string[] = [];

    for (const row of rows) {
      if (row.anker_monat === null) {
        ohneAnker.push(row.system_id);
      } else {
        bezuege.push({ systemId: row.system_id, ankerMonat: row.anker_monat });
      }
    }

    return { bezuege, ohneAnker };
  }

  /**
   * A18 — die Zahl der Systeme, die der Lauf wegen des Verarbeitungsstatus
   * ihres Endkunden NICHT anfasst.
   *
   * Sie steht im Laufergebnis, weil ein blockierter Lauf sonst von einem
   * leeren nicht zu unterscheiden wäre (dieselbe Begründung wie
   * `uebersprungenOffenerVorgang` im Retention-Runner). Ein plötzlicher
   * Anstieg dieser Zahl ist ein Befund, kein Betriebsrauschen.
   */
  async zaehleSystemeNichtAktiverEndkunden(): Promise<number> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT count(*)::text AS anzahl
         FROM energy.system s
         JOIN energy.endkunde e ON e.id = s.endkunde_id
        WHERE e.verarbeitungs_status <> 'aktiv'`,
    );

    const rows = rawRows as { anzahl: string }[];
    return Number(rows[0]?.anzahl ?? '0');
  }
}
