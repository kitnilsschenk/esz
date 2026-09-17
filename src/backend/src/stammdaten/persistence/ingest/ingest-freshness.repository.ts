import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows } from '../map-row';
import { decodeCursor } from '../cursor.util';

/**
 * ADR-0005 §27 (D15, TB-04) — query-basiertes Repository für die BISLANG
 * ungenutzten Schreibpfade `ingest.kanal_status` (Freshness je Kanal,
 * `GREATEST`-Upsert bei jedem erfolgreichen Ingest, s.
 * `ingest-worker/persistence/messwert-schreibpfad.repository.ts`) und
 * `ingest.ausfall_vorgang` (Vorgangs-Dokumentation `offen|andauernd|
 * behoben`) — Backend-Lücke 2 aus dem Betriebs-UI-Konzept: beide Tabellen
 * werden geschrieben, aber bislang von KEINEM Endpoint gelesen.
 *
 * WICHTIG (Konstruktionsgarantie): `ingest.kanal_status.messkanal_key`/
 * `ingest.ausfall_vorgang.messkanal_key` sind LOGISCHE Verweise auf
 * `energy.messkanal.kanal_key` (das interne Integer-Hypertable-Surrogat,
 * NIEMALS exponiert/selektiert, §12) — dieses Repository JOINt intern
 * darüber, gibt aber AUSSCHLIESSLICH die externe UUID
 * (`energy.messkanal.id`) nach außen. Es besteht KEIN direkter DB-Grant-
 * Nachweis für den produktiven `edms_app`-Rollenpfad auf `ingest.*` (s.
 * `migrations/V0012__measurement_taegliche_abdeckung.sql`, Abschnitt
 * "Konsumenten-Grants ... noch ausstehende allgemeine RBAC-DB-Rollen-
 * Verdrahtung") — offener Punkt, s. Auslieferungsbericht dieses
 * Arbeitspakets, NICHT Teil dieser Änderung (Migrations-Verbot ohne
 * explizite Freigabe).
 *
 * Kein `ingest.ausfall_vorgang`-Schreibpfad existiert bislang (der
 * periodische TB-04-Freshness-Check-Job ist ADR-0005 §31 offener Punkt,
 * `iot-ingestion-engineer`) — die Ausfall-Erkennung dieses Lesepfads
 * berechnet `ueberfaellig` daher SELBST, zur ABFRAGEZEIT, aus
 * `ingest.kanal_status.letzter_ts` gegen die übergebene Schwelle, statt sich
 * ausschließlich auf (aktuell nie geschriebene) `ingest.ausfall_vorgang`-
 * Zeilen zu verlassen — bleibt aber vorwärtskompatibel: eine vom künftigen
 * Job geschriebene, noch nicht `behoben`e Zeile wird ZUSÄTZLICH
 * berücksichtigt (LEFT JOIN, s. u.).
 */
export type AusfallVorgangStatus = 'offen' | 'andauernd' | 'behoben';

const AUSFALL_VORGANG_STATUS_WERTE: readonly AusfallVorgangStatus[] = ['offen', 'andauernd', 'behoben'];

function toAusfallVorgangStatus(value: string | null): AusfallVorgangStatus | null {
  if (value === null) {
    return null;
  }
  const match = AUSFALL_VORGANG_STATUS_WERTE.find((kandidat) => kandidat === value);
  return match ?? null;
}

export interface UeberfaelligerKanalRow {
  readonly messkanal_id: string;
  readonly zaehler_id: string;
  readonly letzter_ts: string;
  readonly ueberfaellig: boolean;
  readonly ausfall_status: string | null;
  readonly ausfall_seit: string | null;
}

export interface UeberfaelligerKanalEintrag {
  readonly messkanalId: string;
  readonly zaehlerId: string;
  readonly letzteUebertragung: string;
  readonly ueberfaellig: boolean;
  readonly ausfallStatus: AusfallVorgangStatus | null;
  readonly ausfallSeit: string | null;
}

function mapUeberfaelligerKanalRow(row: UeberfaelligerKanalRow): UeberfaelligerKanalEintrag {
  return {
    messkanalId: row.messkanal_id,
    zaehlerId: row.zaehler_id,
    letzteUebertragung: row.letzter_ts,
    ueberfaellig: row.ueberfaellig,
    ausfallStatus: toAusfallVorgangStatus(row.ausfall_status),
    ausfallSeit: row.ausfall_seit,
  };
}

export interface ListUeberfaelligOptions {
  readonly cursor?: string;
  readonly limit: number;
  /** UTC-ISO-Zeitpunkt (`now() - TB04_FRESHNESS_SCHWELLE_STUNDEN`), vom Service berechnet. */
  readonly schwelle: string;
}

export interface MesskanalFreshnessRow {
  readonly messkanal_id: string;
  readonly letzter_ts: string | null;
  readonly ueberfaellig: boolean;
  readonly ausfall_status: string | null;
  readonly ausfall_seit: string | null;
}

export interface MesskanalFreshnessEintrag {
  readonly messkanalId: string;
  readonly letzteUebertragung: string | null;
  readonly ueberfaellig: boolean;
  readonly ausfallStatus: AusfallVorgangStatus | null;
  readonly ausfallSeit: string | null;
}

function mapMesskanalFreshnessRow(row: MesskanalFreshnessRow): MesskanalFreshnessEintrag {
  return {
    messkanalId: row.messkanal_id,
    letzteUebertragung: row.letzter_ts,
    ueberfaellig: row.ueberfaellig,
    ausfallStatus: toAusfallVorgangStatus(row.ausfall_status),
    ausfallSeit: row.ausfall_seit,
  };
}

@Injectable()
export class IngestFreshnessRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * TB-04-Ausfall-Liste (Dashboard-Kachel „Zähler mit Datenausfall", UX-
   * Konzept Priorität 1): treibt von `ingest.kanal_status` (1 Zeile JE
   * Kanal, existiert ERST nach dem ersten erfolgreichen Ingest) — Kanäle,
   * die noch NIE gesendet haben, sind bewusst NICHT Teil dieser Liste (das
   * ist der strukturell getrennte DE-02-„kein_messkanal"/„kein_zaehler"-Fall
   * in `EnergyMonitoringRepository`, nicht TB-04 „Ausfall nach vorheriger
   * Aktivität"). Schließt stillgelegte Zähler/Messkanäle aus (Randfall
   * „stillgelegter Zähler" — kein Sanktionsrisiko für eine bewusst beendete
   * Messung). `ueberfaellig` wird ZUR ABFRAGEZEIT aus `letzter_ts` vs.
   * `schwelle` berechnet (kein Job schreibt aktuell `ausfall_vorgang`, s.
   * Klassen-Dok); ein bereits dokumentierter, NICHT behobener
   * `ausfall_vorgang` wird per LEFT JOIN zusätzlich (vorwärtskompatibel)
   * berücksichtigt. Sortierung `letzter_ts ASC` — die am längsten
   * ausgefallenen Kanäle zuerst (Priorität für die Dashboard-Kachel).
   */
  async listUeberfaellig(options: ListUeberfaelligOptions): Promise<UeberfaelligerKanalEintrag[]> {
    const conditions: string[] = [`m.status = 'aktiv'`, `z.status = 'aktiv'`, `(ks.letzter_ts < $1::timestamptz OR av.id IS NOT NULL)`];
    const params: unknown[] = [options.schwelle];

    const decoded = options.cursor !== undefined ? decodeCursor(options.cursor) : undefined;
    if (decoded !== undefined) {
      params.push(decoded.createdAt, decoded.id);
      const idxA = params.length - 1;
      const idxB = params.length;
      conditions.push(
        `(ks.letzter_ts > $${String(idxA)}::timestamptz OR (ks.letzter_ts = $${String(idxA)}::timestamptz AND m.id > $${String(idxB)}::uuid))`,
      );
    }

    params.push(options.limit + 1);

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT
         m.id          AS messkanal_id,
         z.id          AS zaehler_id,
         ks.letzter_ts AS letzter_ts,
         (ks.letzter_ts < $1::timestamptz) AS ueberfaellig,
         av.status     AS ausfall_status,
         av.beginn_ts  AS ausfall_seit
       FROM ingest.kanal_status ks
       JOIN energy.messkanal m ON m.kanal_key = ks.messkanal_key
       JOIN energy.zaehler z   ON z.id = m.zaehler_id
       LEFT JOIN ingest.ausfall_vorgang av
         ON av.messkanal_key = ks.messkanal_key AND av.status <> 'behoben'
       WHERE ${conditions.join(' AND ')}
       ORDER BY ks.letzter_ts ASC, m.id ASC
       LIMIT $${String(params.length)}`,
      params,
    );

    return mapManyRows(bindRows<UeberfaelligerKanalRow>(rawRows), mapUeberfaelligerKanalRow);
  }

  /**
   * Freshness JE Messkanal eines Zählers (Zähler-Detailseite, UX-Konzept
   * Block 3 „Datenfluss-Status" + Messkanäle-Tabellen-Spalte „Letzte
   * Übertragung") — treibt von `energy.messkanal` (ALLE Kanäle des
   * Zählers, UNABHÄNGIG vom Status: die UI erweitert die bestehende
   * Messkanal-Tabelle, die ebenfalls nicht nach Status filtert). LEFT JOIN
   * gegen `ingest.kanal_status`/`ingest.ausfall_vorgang` — ein Kanal, der
   * noch NIE erfolgreich Daten geliefert hat, bekommt `letzter_ts=null`
   * (EMPTY-STATE, kein Fehler) und gilt als `ueberfaellig=true` (kein
   * Lebenszeichen ist trivial nicht „frisch").
   */
  async findByZaehlerId(zaehlerId: string, schwelle: string): Promise<MesskanalFreshnessEintrag[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT
         m.id AS messkanal_id,
         ks.letzter_ts AS letzter_ts,
         (ks.letzter_ts IS NULL OR ks.letzter_ts < $2::timestamptz) AS ueberfaellig,
         av.status    AS ausfall_status,
         av.beginn_ts AS ausfall_seit
       FROM energy.messkanal m
       LEFT JOIN ingest.kanal_status ks ON ks.messkanal_key = m.kanal_key
       LEFT JOIN ingest.ausfall_vorgang av
         ON av.messkanal_key = m.kanal_key AND av.status <> 'behoben'
       WHERE m.zaehler_id = $1
       ORDER BY m.created_at ASC, m.id ASC`,
      [zaehlerId, schwelle],
    );

    return mapManyRows(bindRows<MesskanalFreshnessRow>(rawRows), mapMesskanalFreshnessRow);
  }
}
