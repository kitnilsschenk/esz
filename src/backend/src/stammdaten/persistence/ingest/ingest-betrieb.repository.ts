import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { bindRows, mapManyRows, mapOneRow } from '../map-row';
import { decodeCursor, paginate, type PaginatedResult } from '../cursor.util';

export type IngestQuarantaeneGrund =
  | 'envelope_parse_fehler'
  | 'devEUI_unbekannt'
  | 'unbekannter_geraetetyp'
  | 'decode_fehler'
  | 'kanal_unbekannt'
  | 'unplausibel_monotonie_verletzt'
  | 'einheit_inkonsistent'
  | 'zeitstempel_fehlt'
  // ADR-0011 D4 (V0042) -- Tenant und aufgeloester Zaehler zeigen auf
  // verschiedene Endkunden.
  | 'herkunft_widerspruechlich'
  // ADR-0011 O3 Punkt 3 (V0049) -- Zuwachs, den kein Verbrauch erklaert,
  // wohl aber ein geaenderter Wandlerfaktor im fremden Codec.
  | 'skalensprung_verdacht';

export interface IngestQuarantaeneZeile {
  readonly id: string;
  readonly grund: IngestQuarantaeneGrund;
  readonly zaehlerId: string | null;
  readonly messkanalKey: number | null;
  readonly fPort: number | null;
  readonly quelleCode: string | null;
  readonly chirpstackTenantId: string | null;
  readonly chirpstackApplicationId: string | null;
  readonly topicRedacted: string;
  readonly empfangenAt: string;
  /** `messgroesse (einheit)`-Liste des betroffenen Zählers; `null` ohne Zähler oder ohne Kanäle. */
  readonly zaehlerMessgroessen: string | null;
  /** Nur für die Cursor-Bildung (`paginate`), nicht Teil der API-Antwort. */
  readonly createdAt: string;
}

export interface IngestAktivitaet {
  readonly letzterMesswertAt: string | null;
  readonly letzteSchreibungAt: string | null;
  readonly letzteQuarantaeneAt: string | null;
}

export interface IngestQuelleZeile {
  readonly quelleCode: string;
  readonly brokerHost: string;
  readonly topic: string;
  readonly clientId: string;
  readonly verbunden: boolean;
  readonly letzteVerbindungAt: string | null;
  readonly letzterHerzschlagAt: string;
  /** Gibt es zu dieser Kennung eine gepflegte Quelle (`ingest.quelle`, V0059)? */
  readonly gepflegt: boolean;
  /** Die gepflegte Quelle steht auf `inaktiv` — der Worker läuft trotzdem noch. */
  readonly gepflegtInaktiv: boolean;
  /**
   * Felder, in denen sich der laufende Prozess von der gepflegten
   * Konfiguration unterscheidet. Leer, wenn beides übereinstimmt oder keine
   * gepflegte Quelle existiert.
   */
  readonly abweichendeFelder: readonly string[];
}

export interface IngestVerwurfTag {
  /** Kalendertag (UTC) im Format YYYY-MM-DD. */
  readonly tag: string;
  readonly grund: string;
  readonly anzahl: string;
}

export interface IngestGrundAnzahl {
  readonly grund: IngestQuarantaeneGrund;
  readonly anzahl: string;
}

/**
 * Betriebs-Lesezugriffe auf die Ingest-Tabellen (ADR-0011 A2) —
 * AUSSCHLIESSLICH lesend. Der Schreibpfad liegt im Ingest-Worker-Prozess und
 * hat eigene Repositories; hier wird nur ausgewertet, was dort entstanden
 * ist.
 *
 * **Was hier bewusst NICHT ausgelesen wird:** `deveui_blind_index` und
 * `payload_hash`. Der Blind-Index ist ein über alle Uplinks eines Geräts
 * stabiler Korrelations-Schlüssel — RL-2 verbietet die Klartext-DevEUI, und
 * ein dauerhaft gleicher Ersatzschlüssel wäre in einer Betriebsliste
 * derselbe Quasi-Identifier in Grün. Aus `rohpayload_redacted` wird GENAU EIN
 * Feld gehoben (`fPort`), weil sich ohne die Portnummer ein `decode_fehler`
 * nicht einordnen lässt; der Rest des Envelopes bleibt in der Tabelle.
 */
@Injectable()
export class IngestBetriebRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

  /**
   * Wann kam zuletzt etwas an? Drei Zeitpunkte aus zwei Tabellen — bewusst
   * KEIN Verbindungszustand: Der Worker ist ein eigener Prozess, sein
   * Zustand steht nirgends in der Datenbank (ADR-0011 O8).
   */
  async findAktivitaet(): Promise<IngestAktivitaet> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT (SELECT MAX(letzter_ts) FROM ingest.kanal_status)            AS letzter_messwert_at,
              (SELECT MAX(updated_at) FROM ingest.kanal_status)            AS letzte_schreibung_at,
              (SELECT MAX(empfangen_at) FROM ingest.eingang_quarantaene)   AS letzte_quarantaene_at`,
    );

    const zeile = mapOneRow(
      bindRows<{
        readonly letzter_messwert_at: Date | string | null;
        readonly letzte_schreibung_at: Date | string | null;
        readonly letzte_quarantaene_at: Date | string | null;
      }>(rawRows),
      (row) => ({
        letzterMesswertAt: alsIsoOderNull(row.letzter_messwert_at),
        letzteSchreibungAt: alsIsoOderNull(row.letzte_schreibung_at),
        letzteQuarantaeneAt: alsIsoOderNull(row.letzte_quarantaene_at),
      }),
    );

    return zeile ?? { letzterMesswertAt: null, letzteSchreibungAt: null, letzteQuarantaeneAt: null };
  }

  /**
   * Zustand JE Netzserver-Quelle (ADR-0011 O8/D8) — was die Worker zuletzt
   * ueber sich gemeldet haben.
   *
   * Ausgegeben wird der ROHE Zustand: `verbunden` und der Zeitpunkt des
   * letzten Herzschlags. Ob eine Quelle als lebendig gilt, entscheidet die
   * Anwendungsschicht — ein Schwellenwert in SQL waere ohne Migration nicht
   * korrigierbar.
   */
  async findQuellen(): Promise<IngestQuelleZeile[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT st.quelle_code, st.broker_host, st.topic, st.client_id, st.verbunden,
              st.letzte_verbindung_at, st.letzter_herzschlag_at,
              -- Die GEPFLEGTE Konfiguration daneben. Der Worker laedt sie nur
              -- beim Start; wird sie danach geaendert, faehrt er weiter mit
              -- der alten. Ohne diesen Vergleich zeigte die Oberflaeche die
              -- gepflegten Werte, waehrend der Prozess andere benutzt — die
              -- Anzeige wuerde also das Gegenteil von dem sagen, wofuer man
              -- sie aufruft.
              (q.quelle_code IS NOT NULL)                    AS gepflegt,
              (q.status = 'inaktiv')                         AS gepflegt_inaktiv,
              (q.broker_host IS DISTINCT FROM st.broker_host) AS broker_abweichend,
              (q.topic       IS DISTINCT FROM st.topic)       AS topic_abweichend,
              (q.client_id   IS DISTINCT FROM st.client_id)   AS client_id_abweichend
         FROM ingest.quelle_status st
         LEFT JOIN ingest.quelle q ON q.quelle_code = st.quelle_code
        ORDER BY st.quelle_code ASC`,
    );

    return mapManyRows(
      bindRows<{
        readonly quelle_code: string;
        readonly broker_host: string;
        readonly topic: string;
        readonly client_id: string;
        readonly verbunden: boolean;
        readonly letzte_verbindung_at: Date | string | null;
        readonly letzter_herzschlag_at: Date | string;
        readonly gepflegt: boolean;
        readonly gepflegt_inaktiv: boolean | null;
        readonly broker_abweichend: boolean | null;
        readonly topic_abweichend: boolean | null;
        readonly client_id_abweichend: boolean | null;
      }>(rawRows),
      (row) => ({
        quelleCode: row.quelle_code,
        brokerHost: row.broker_host,
        topic: row.topic,
        clientId: row.client_id,
        verbunden: row.verbunden,
        letzteVerbindungAt: alsIsoOderNull(row.letzte_verbindung_at),
        letzterHerzschlagAt: alsIso(row.letzter_herzschlag_at),
        gepflegt: row.gepflegt,
        gepflegtInaktiv: row.gepflegt_inaktiv === true,
        // Nur sinnvoll, WENN gepflegt — sonst gibt es nichts zu vergleichen.
        abweichendeFelder: row.gepflegt
          ? [
              ...(row.broker_abweichend === true ? ['brokerHost'] : []),
              ...(row.topic_abweichend === true ? ['topic'] : []),
              ...(row.client_id_abweichend === true ? ['clientId'] : []),
            ]
          : [],
      }),
    );
  }

  /** Gesamtzahl liegengebliebener Uplinks — als String, weil `count()` ein `bigint` ist. */
  async countQuarantaene(): Promise<string> {
    const rawRows: unknown = await this.txHost.tx.query(
      'SELECT COUNT(*)::text AS anzahl FROM ingest.eingang_quarantaene',
    );
    const zeile = mapOneRow(bindRows<{ readonly anzahl: string }>(rawRows), (row) => row.anzahl);
    return zeile ?? '0';
  }

  /** Verteilung je Grund, absteigend — nur Gründe, die überhaupt vorkommen. */
  async countQuarantaeneJeGrund(): Promise<IngestGrundAnzahl[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT grund, COUNT(*)::text AS anzahl
         FROM ingest.eingang_quarantaene
        GROUP BY grund
        ORDER BY COUNT(*) DESC, grund ASC`,
    );
    return mapManyRows(
      bindRows<{ readonly grund: IngestQuarantaeneGrund; readonly anzahl: string }>(rawRows),
      (row) => ({ grund: row.grund, anzahl: row.anzahl }),
    );
  }

  /**
   * Auflage C-6 — der subjektfreie Verwurfszaehler
   * (`ingest.verwurf_tagesaggregat`, V0085).
   *
   * Der Gegenpart zur Quarantaene: Ein Uplink ohne Rechtsgrundlage wird
   * VERWORFEN, nicht in Quarantaene gelegt (A12-13) — es entsteht also keine
   * Zeile, die man ansehen koennte. Bliebe auch der Zaehler ungelesen, waere
   * ein stiller Totalausfall des Gates von "niemand hat eingewilligt" nicht
   * zu unterscheiden. Genau das ist das Risiko R-0008.
   *
   * Liefert die letzten `tage` Kalendertage je Grund, neueste zuerst.
   * SUBJEKTFREI, weil die Tabelle es ist: kein Zaehler, kein Geraet, keine
   * Uhrzeit unterhalb des Tages.
   */
  async findVerwurfTage(tage: number): Promise<IngestVerwurfTag[]> {
    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT to_char(tag, 'YYYY-MM-DD') AS tag, grund, anzahl::text AS anzahl
         FROM ingest.verwurf_tagesaggregat
        WHERE tag >= CURRENT_DATE - ($1::int - 1)
        ORDER BY tag DESC, grund ASC`,
      [tage],
    );
    return mapManyRows(
      bindRows<{ readonly tag: string; readonly grund: string; readonly anzahl: string }>(rawRows),
      (row) => ({ tag: row.tag, grund: row.grund, anzahl: row.anzahl }),
    );
  }

  /**
   * Seite liegengebliebener Uplinks, neueste zuerst.
   *
   * Der geteilte Cursor (`createdAt`+`id`) sortiert AUFSTEIGEND; hier wird
   * absteigend geblättert, weil beim Anschließen der jüngste Fehlschlag der
   * interessante ist. Deshalb die umgekehrte Vergleichsrichtung im
   * `WHERE` — der Cursor selbst bleibt derselbe Baustein.
   */
  async listQuarantaenePage(options: {
    readonly grund?: IngestQuarantaeneGrund;
    readonly quelleCode?: string;
    readonly cursor?: string;
    readonly limit: number;
  }): Promise<PaginatedResult<IngestQuarantaeneZeile>> {
    const params: unknown[] = [];
    const bedingungen: string[] = [];

    if (options.grund !== undefined) {
      params.push(options.grund);
      bedingungen.push(`q.grund = $${String(params.length)}`);
    }
    if (options.quelleCode !== undefined) {
      params.push(options.quelleCode);
      bedingungen.push(`q.quelle_code = $${String(params.length)}`);
    }

    const decoded = options.cursor !== undefined ? decodeCursor(options.cursor) : undefined;
    if (decoded !== undefined) {
      params.push(decoded.createdAt, decoded.id);
      const a = params.length - 1;
      const b = params.length;
      bedingungen.push(
        `(date_trunc('milliseconds', q.created_at) < $${String(a)}::timestamptz` +
          ` OR (date_trunc('milliseconds', q.created_at) = $${String(a)}::timestamptz AND q.id < $${String(b)}::uuid))`,
      );
    }

    params.push(options.limit + 1);
    const whereClause = bedingungen.length > 0 ? `WHERE ${bedingungen.join(' AND ')}` : '';

    const rawRows: unknown = await this.txHost.tx.query(
      `SELECT q.id, q.grund, q.zaehler_id, q.messkanal_key, q.topic_redacted, q.empfangen_at, q.created_at,
              q.quelle_code, q.chirpstack_tenant_id, q.chirpstack_application_id,
              (q.rohpayload_redacted -> 'fPort') AS f_port,
              -- Die Messgroessen, die der betroffene Zaehler TATSAECHLICH fuehrt.
              -- Beim Grund kanal_unbekannt ist das die eine Angabe, die fehlte:
              -- Der Kanal-Lookup vergleicht exakt, und ohne diese Liste musste
              -- man die Nutzlast von Hand dekodieren und gegen die Stammdaten
              -- halten, um eine abweichende Schreibweise zu erkennen.
              -- Technische Groessen, kein Personenbezug (der Zaehler ist in
              -- derselben Zeile ohnehin verlinkt).
              (SELECT string_agg(mk.messgroesse || ' (' || mk.einheit || ')', ', ' ORDER BY mk.messgroesse)
                 FROM energy.messkanal mk
                WHERE mk.zaehler_id = q.zaehler_id) AS zaehler_messgroessen
         FROM ingest.eingang_quarantaene q
         ${whereClause}
        ORDER BY date_trunc('milliseconds', q.created_at) DESC, q.id DESC
        LIMIT $${String(params.length)}`,
      params,
    );

    const alle = mapManyRows(
      bindRows<{
        readonly id: string;
        readonly grund: IngestQuarantaeneGrund;
        readonly zaehler_id: string | null;
        readonly messkanal_key: number | null;
        readonly topic_redacted: string;
        readonly empfangen_at: Date | string;
        readonly created_at: Date | string;
        readonly quelle_code: string | null;
        readonly chirpstack_tenant_id: string | null;
        readonly chirpstack_application_id: string | null;
        readonly f_port: unknown;
        readonly zaehler_messgroessen: string | null;
      }>(rawRows),
      (row) => ({
        id: row.id,
        grund: row.grund,
        zaehlerId: row.zaehler_id,
        messkanalKey: row.messkanal_key,
        fPort: typeof row.f_port === 'number' ? row.f_port : null,
        zaehlerMessgroessen: row.zaehler_messgroessen,
        quelleCode: row.quelle_code,
        chirpstackTenantId: row.chirpstack_tenant_id,
        chirpstackApplicationId: row.chirpstack_application_id,
        topicRedacted: row.topic_redacted,
        empfangenAt: alsIso(row.empfangen_at),
        createdAt: alsIso(row.created_at),
      }),
    );

    return paginate(alle, options.limit);
  }
}

function alsIso(wert: Date | string): string {
  return wert instanceof Date ? wert.toISOString() : new Date(wert).toISOString();
}

function alsIsoOderNull(wert: Date | string | null): string | null {
  return wert === null ? null : alsIso(wert);
}
