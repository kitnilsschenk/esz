import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { INGEST_PG_POOL } from '../../ingest-worker/persistence/ingest-pg.module';

/** `measurement.messwert.qualitaet` — 0=gemessen, 1=geschaetzt, 2=korrigiert, 3=ersatzwert (V0002). */
export const QUALITAET_CODES = { gemessen: 0, geschaetzt: 1 } as const;
export type ImportQualitaet = keyof typeof QUALITAET_CODES;

/**
 * Die Einstufung, wenn niemand etwas anderes sagt.
 *
 * `geschaetzt` und nicht `gemessen`: Die schwaechere Aussage ist die sichere.
 * Wer eine Tabelle importiert, weiss oft selbst nicht, wie ihre Werte
 * zustande kamen — und eine faelschlich als gemessen eingestufte Reihe traegt
 * am Ende einen Nachweis, den sie nicht tragen darf.
 */
export const QUALITAET_STANDARD: ImportQualitaet = 'geschaetzt';

/** `measurement.messwert.herkunft` — 0=ingest_live, 1=backfill, 2=manuell, 3=import_altsystem (V0002). */
export const HERKUNFT_IMPORT_ALTSYSTEM = 3;

/**
 * Wie viele Tageswerte in EINE Anweisung gehen.
 *
 * Die Werte gehen als Arrays hinein (`unnest`), nicht als Einzelparameter —
 * die Grenze von 65 535 Bind-Parametern spielt hier also keine Rolle. 5 000
 * hält die einzelne Anweisung trotzdem überschaubar; ein Förderjahr sind 365
 * Zeilen, eine ganze Mappe rund 3 700.
 */
const BUENDEL = 5_000;

export interface ImportTageswert {
  readonly tag: string;
  readonly kwh: number;
}

/**
 * Schreibt importierte Tageswerte nach `measurement.messwert`.
 *
 * **Warum über den Ingest-Pool und nicht über die App-Verbindung.**
 * `measurement.messwert` ist für `edms_app` nicht beschreibbar — INSERT hat
 * dort ausschließlich `edms_ingest_worker` (V0013). Das ist keine Formalie,
 * die man für ein Werkzeug umgehen sollte: Die Rollentrennung ist der Grund,
 * warum ein Fehler in der Fach-API keine Messwerte verfälschen kann. Der
 * Import fügt sich ein, statt sich eine Ausnahme zu verschaffen — in der
 * Entwicklungsumgebung fällt das nicht auf (dort läuft die App als
 * Eigentümer), in jeder anderen schon.
 *
 * **Warum ein eigener Schreibweg statt `MesswertSchreibpfadRepository`.**
 * Jener schreibt EINEN Wert je Transaktion samt Kanalstand-Fortschreibung —
 * richtig für einen eintreffenden Uplink, falsch für 12 000 Tageswerte am
 * Stück. Die fachlich tragende Eigenschaft ist übernommen und steht unten
 * wörtlich: dieselbe Konfliktregel über `measurement.rang(...)`.
 *
 * **`herkunft = import_altsystem` hat den NIEDRIGSTEN Rang** (V0013:
 * `WHEN 3 THEN 0`). Ein importierter Altwert überschreibt damit niemals einen
 * gemessenen — er füllt nur, wo nichts steht. Genau so soll ein
 * Bestandsimport sich verhalten.
 *
 * **Die Qualitätsstufe entscheidet der Mensch, der importiert.** Sie ist
 * keine Formalie: `abdeckungPct` zählt ausschließlich GEMESSENE Tage
 * (`berechnungslauf.service.ts`, ADR-0006 B12), und unter 75 % ist ein Monat
 * `nicht_ausweisbar`. Ein vollständig als `geschaetzt` importiertes Jahr
 * ergibt damit eine Abdeckung von 0 % und trägt keinen Nachweis — richtig
 * für eine modellierte Reihe, falsch für die Ablesungen eines Altsystems.
 * Diese Unterscheidung kann nur treffen, wer die Herkunft der Datei kennt.
 */
@Injectable()
export class ImportMesswertRepository {
  constructor(@Inject(INGEST_PG_POOL) private readonly pool: Pool) {}

  /**
   * Schreibt die Tageswerte eines Kanals. Gibt zurück, wie viele Zeilen
   * tatsächlich entstanden oder ersetzt wurden.
   *
   * Der Zeitstempel ist der Tagesbeginn in `zeitzone` — die Umrechnung macht
   * die Datenbank (`AT TIME ZONE`), nicht JavaScript. Ein Tageswert muss in
   * genau den Kalendertag fallen, unter dem die Verdichtung ihn später sucht
   * (V0051); eine selbst gerechnete Zeitzonen-Verschiebung wäre zweimal im
   * Jahr um eine Stunde daneben und damit einmal im Jahr um einen Tag.
   */
  async schreibe(
    messkanalKey: number,
    zeitzone: string,
    werte: readonly ImportTageswert[],
    qualitaet: ImportQualitaet = QUALITAET_STANDARD,
  ): Promise<number> {
    let geschrieben = 0;

    for (let ab = 0; ab < werte.length; ab += BUENDEL) {
      const buendel = werte.slice(ab, ab + BUENDEL);
      const ergebnis = await this.pool.query(
        `INSERT INTO measurement.messwert (messkanal_key, ts, wert, qualitaet, herkunft)
         SELECT $1, (t.tag::date)::timestamp AT TIME ZONE $2, t.wert, $3, $4
           FROM unnest($5::date[], $6::numeric[]) AS t(tag, wert)
         ON CONFLICT (messkanal_key, ts) DO UPDATE
           SET wert = EXCLUDED.wert, qualitaet = EXCLUDED.qualitaet, herkunft = EXCLUDED.herkunft
           WHERE measurement.rang(EXCLUDED.qualitaet, EXCLUDED.herkunft)
               > measurement.rang(measurement.messwert.qualitaet, measurement.messwert.herkunft)`,
        [
          messkanalKey,
          zeitzone,
          QUALITAET_CODES[qualitaet],
          HERKUNFT_IMPORT_ALTSYSTEM,
          buendel.map((w) => w.tag),
          buendel.map((w) => w.kwh.toFixed(3)),
        ],
      );
      geschrieben += ergebnis.rowCount ?? 0;
    }

    return geschrieben;
  }

  /** Wie viele Werte auf diesem Kanal im Zeitraum bereits liegen — für die Bilanz des Probelaufs. */
  async zaehleVorhandene(messkanalKey: number, vonTag: string, bisTag: string, zeitzone: string): Promise<number> {
    const ergebnis = await this.pool.query<{ anzahl: string }>(
      `SELECT count(*)::text AS anzahl
         FROM measurement.messwert
        WHERE messkanal_key = $1
          AND ts >= ($2::date)::timestamp AT TIME ZONE $4
          AND ts <  (($3::date) + 1)::timestamp AT TIME ZONE $4`,
      [messkanalKey, vonTag, bisTag, zeitzone],
    );
    return Number.parseInt(ergebnis.rows[0]?.anzahl ?? '0', 10);
  }
}
