import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapOneRow } from '../../stammdaten/persistence/map-row';
import type { TagesaggregatZeile } from './analytics-messwert-monat.repository';
import type { KlimaTagWert } from '../klima/klima-quelle.port';
import type { EinflussIntervallProjektionZeile } from './einfluss-intervall-lese.repository';

export type EingangSnapshotArt = 'messwert_tag' | 'klima_tag' | 'einflussgroesse';

export interface EingangSnapshotErgebnis {
  readonly id: string;
  /** `true`, wenn der Snapshot NEU erstellt wurde (Detail-Zeilen müssen dann NEU geschrieben werden). */
  readonly neuErstellt: boolean;
}

/**
 * `analytics.eingang_snapshot` (B2, D2 "die tragende Entscheidung") —
 * CONTENT-ADDRESSED über `UNIQUE (endkunde_id, art, inhalt_hash)`: existiert
 * bereits ein Snapshot mit demselben Hash für denselben Endkunden/dieselbe
 * Art, wird SEINE `id` wiederverwendet (Reproduzierbarkeit F6/D1, "ein
 * Re-Run über einen unveränderten Zeitraum dedupliziert auf denselben
 * Snapshot" — V0019 D-CASCADE-Kommentar). Append-only: `edms_app` hat NUR
 * INSERT/SELECT auf `eingang_snapshot`/`eingang_messwert_tag`/
 * `eingang_klima_tag` (V0019-GRANTs) — kein UPDATE/DELETE-Pfad hier.
 */
@Injectable()
export class AnalyticsEingangSnapshotRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * Insert-or-reuse (B2 Dedup). `inhaltHash` MUSS vom Aufrufer über die
   * KANONISIERTE, geordnete Rohmenge gebildet werden (`node:crypto`
   * `sha256`, s. `BerechnungslaufService.canonicalizeSnapshot*`) — dieses
   * Repository kennt die Hash-Bildung selbst nicht (Separation of Concerns:
   * Persistenz vs. Kanonisierungs-Fachlogik).
   */
  async findeOderErstelle(input: {
    readonly endkundeId: string;
    readonly art: EingangSnapshotArt;
    readonly inhaltHash: Buffer;
    readonly von: string;
    readonly bis: string;
    readonly zeilenAnzahl: number;
  }): Promise<EingangSnapshotErgebnis> {
    const existing: unknown = await this.txHost.tx.query(
      `SELECT id FROM analytics.eingang_snapshot WHERE endkunde_id = $1 AND art = $2 AND inhalt_hash = $3`,
      [input.endkundeId, input.art, input.inhaltHash],
    );
    const existingRow = mapOneRow(bindRows<{ readonly id: string }>(existing), (row) => row.id);
    if (existingRow !== undefined) {
      return { id: existingRow, neuErstellt: false };
    }

    const inserted: unknown = await this.txHost.tx.query(
      `INSERT INTO analytics.eingang_snapshot (id, endkunde_id, art, inhalt_hash, von, bis, zeilen_anzahl)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::date, $5::date, $6)
       RETURNING id`,
      [input.endkundeId, input.art, input.inhaltHash, input.von, input.bis, input.zeilenAnzahl],
    );
    const insertedId = mapOneRow(bindRows<{ readonly id: string }>(inserted), (row) => row.id);
    if (insertedId === undefined) {
      throw new Error('analytics.eingang_snapshot-INSERT hat keine Zeile zurueckgegeben — unerwarteter DB-Zustand.');
    }

    return { id: insertedId, neuErstellt: true };
  }

  /** NUR aufrufen, wenn der Snapshot in DIESER Transaktion NEU erstellt wurde (`neuErstellt===true`). */
  async insertMesswertTagZeilen(snapshotId: string, zeilen: readonly TagesaggregatZeile[]): Promise<void> {
    for (const zeile of zeilen) {
      await this.txHost.tx.query(
        `INSERT INTO analytics.eingang_messwert_tag (snapshot_id, messkanal_key, tag, wert_kwh, qualitaet_min, anzahl_messwerte)
         VALUES ($1, $2, $3::date, $4, $5, $6)
         ON CONFLICT (snapshot_id, messkanal_key, tag) DO NOTHING`,
        [snapshotId, zeile.messkanalKey, zeile.tag, zeile.wertKwh, zeile.qualitaetMin, zeile.anzahlMesswerte],
      );
    }
  }

  /** NUR aufrufen, wenn der Snapshot in DIESER Transaktion NEU erstellt wurde. `gtzTage` = je Tag vorab mit den Lauf-Parametern berechnete GTZ (V0019-Kommentar: "mit den lauf-eigenen t_innen/t_heizgrenze berechnet"). */
  async insertKlimaTagZeilen(
    snapshotId: string,
    stationRef: string,
    zeilen: readonly (KlimaTagWert & { readonly gtzTag: number })[],
  ): Promise<void> {
    for (const zeile of zeilen) {
      await this.txHost.tx.query(
        `INSERT INTO analytics.eingang_klima_tag (snapshot_id, station_ref, tag, t_mittel, gtz_tag)
         VALUES ($1, $2, $3::date, $4, $5)
         ON CONFLICT (snapshot_id, tag) DO NOTHING`,
        [snapshotId, stationRef, zeile.tag, zeile.tMittelC, zeile.gtzTag],
      );
    }
  }

  /**
   * NUR aufrufen, wenn der Snapshot in DIESER Transaktion NEU erstellt wurde
   * (`neuErstellt===true`). Dritte Snapshot-Art (D7/A5, B7) — `zeilen` MUSS
   * bereits die pseudonyme PROJEKTION sein (`EinflussIntervallProjektionZeile`,
   * GENAU die sechs Zielspalten): diese Methode selbst führt KEIN weiteres
   * Feld-Whitelisting durch, sie verlässt sich auf den Typ des Parameters —
   * die eigentliche Härtung (Verwaltungsfelder erreichen `analytics` nie)
   * liegt bereits an der QUELLE (`EinflussIntervallLeseRepository`, das
   * `betroffener_typ`/`quelle_typ`/`rechtsgrundlage`/`abwaegung_ref`/
   * `art14_information_at`/`anlass_code` gar nicht erst selektiert).
   */
  async insertEinflussgroesseZeilen(snapshotId: string, zeilen: readonly EinflussIntervallProjektionZeile[]): Promise<void> {
    for (const zeile of zeilen) {
      await this.txHost.tx.query(
        `INSERT INTO analytics.eingang_einflussgroesse (snapshot_id, system_id, groesse_code, wert_num, wert_code, gueltig_ab_monat, gueltig_bis_monat)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7::date)
         ON CONFLICT (snapshot_id, system_id, groesse_code, gueltig_ab_monat) DO NOTHING`,
        [snapshotId, zeile.systemId, zeile.groesseCode, zeile.wertNum, zeile.wertCode, zeile.gueltigAbMonat, zeile.gueltigBisMonat],
      );
    }
  }
}
