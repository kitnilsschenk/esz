import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows } from './map-row';

export interface NachweisgebundeneBestaende {
  /** Anzahl `analytics.berechnungslauf`-Zeilen des Endkunden, die den Shred bewusst überleben (Art. 17(3)(b)). */
  readonly analyticsLaeufe: number;
  /** Anzahl `einfluss.intervall`-Zeilen des Endkunden, die den Shred bewusst überleben (Art. 17(3)(b)). */
  readonly einflussIntervalle: number;
}

interface BestandDbRow {
  readonly analytics_laeufe: number | string;
  readonly einfluss_intervalle: number | string;
}

/**
 * P5b (dsgvo-auditor, ADR-0006 Phase 5, Auflage A7) — zählt für den
 * Shred-Report die Nachweis-gebundenen Bestände eines Endkunden, die beim
 * Krypto-Shredding **bewusst NICHT** gelöscht werden: die pseudonymen
 * Berechnungsläufe in `analytics` und die Einflussgrößen-Intervalle in
 * `einfluss` bleiben unter **Art. 17(3)(b)** (BAFA-Nachweispflicht) bestehen —
 * der Re-Identifikationsschlüssel in `identity` wird vom Shred vernichtet, die
 * pseudonyme/least-privilege-geschützte Kopie überlebt. Ohne diesen Ausweis
 * behauptet der Shred-Report eine Vollständigkeit, die nicht besteht (ADR-0006
 * B7/C1-A7, `docs/adr/ADR-0006` Teil C).
 *
 * REIN LESEND — löscht/ändert nichts. Beide Zählungen laufen direkt über
 * `endkunde_id` (beide Tabellen führen die Spalte, kein Join nötig).
 *
 * Laufzeit-Rolle: heute verbindet die App als `edms` (Owner), kann also beide
 * Namensräume lesen. Sobald die `edms_app`-Least-Privilege-Laufzeit verdrahtet
 * wird (offener Punkt, ADR-0006 C4/P4 + V0012-Präzedenz), braucht dieser
 * Lesepfad einen expliziten `SELECT`-Grant auf `einfluss.intervall`
 * (D8.1: `edms_app` hat auf `einfluss.*` bewusst KEINEN Grant) — dann als
 * eigene Migration + compliance-director-Bestätigung nachzuziehen.
 */
@Injectable()
export class NachweisBestandRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  async zaehleNachweisgebundeneBestaende(endkundeId: string): Promise<NachweisgebundeneBestaende> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT
         (SELECT count(*) FROM analytics.berechnungslauf WHERE endkunde_id = $1)::int AS analytics_laeufe,
         (SELECT count(*) FROM einfluss.intervall    WHERE endkunde_id = $1)::int AS einfluss_intervalle`,
      [endkundeId],
    );
    const row = bindRows<BestandDbRow>(rawRows)[0];
    return {
      analyticsLaeufe: Number(row?.analytics_laeufe ?? 0),
      einflussIntervalle: Number(row?.einfluss_intervalle ?? 0),
    };
  }
}
