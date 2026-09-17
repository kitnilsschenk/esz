import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { INGEST_PG_POOL } from './ingest-pg.module';

/** Die Gruende, aus denen ein Uplink verworfen wird. Geschlossene Liste — der CHECK in V0085 fuehrt dieselbe. */
export type VerwurfGrund = 'rechtsgrundlage_fehlt';

/**
 * Zaehlt verworfene Uplinks — tagesgenau, subjektfrei, dauerhaft
 * (ADR-0012 Stufe C, Auflagen A12-14 und C-6, Tabelle aus V0085).
 *
 * **Warum es diesen Schreibpfad ueberhaupt gibt, obwohl A12-13 Schreiben
 * verbietet.** Verboten ist eine Zeile, die das SUBJEKT weiterfuehrt: Die
 * Daten einer Person, die widerrufen hat, in eine Tabelle mit offener
 * Loeschfrist zu schreiben, kehrte die Wirkung des Widerrufs um. Diese
 * Tabelle traegt keine Zaehler-, Endkunden- oder Anschlussnutzer-Kennung und
 * keine Uhrzeit unterhalb des Tages — sie beantwortet ausschliesslich "wie
 * viele an Tag X aus Grund Y".
 *
 * **Warum das ueberhaupt gezaehlt werden muss.** Ohne diese Zahl ist ein
 * stiller Totalausfall des Gates — eine falsche Matrix, eine kaputte
 * Funktion, ein Fehler in der Subjekt-Aufloesung — nicht von "niemand hat
 * eingewilligt" zu unterscheiden. Beides sieht von aussen gleich aus: Es
 * kommt nichts an. Der In-Prozess-Zaehler im `IngestMetricsService` bleibt
 * daneben bestehen, ueberlebt aber keinen Neustart; erst diese Tabelle macht
 * A12-14 zu einer Zusicherung statt zu einer Absichtserklaerung.
 */
@Injectable()
export class VerwurfAggregatRepository {
  constructor(@Inject(INGEST_PG_POOL) private readonly pool: Pool) {}

  /**
   * Zaehlt einen Verwurf auf den heutigen Tag.
   *
   * `ON CONFLICT` statt Lesen-dann-Schreiben: Zwei Worker-Instanzen am selben
   * Uplink-Strom wuerden sich sonst gegenseitig ueberschreiben, und
   * ausgerechnet die Zahl, die einen Ausfall sichtbar machen soll, fiele zu
   * niedrig aus.
   *
   * `CURRENT_DATE` bildet die Datenbank, nicht der Worker: Laufen Worker und
   * Datenbank in verschiedenen Zeitzonen, gaebe es sonst zwei Wahrheiten
   * darueber, welcher Tag gemeint ist.
   */
  async zaehle(grund: VerwurfGrund): Promise<void> {
    await this.pool.query(
      `INSERT INTO ingest.verwurf_tagesaggregat (tag, grund, anzahl)
            VALUES (CURRENT_DATE, $1, 1)
       ON CONFLICT (tag, grund)
       DO UPDATE SET anzahl     = ingest.verwurf_tagesaggregat.anzahl + 1,
                     zuletzt_at = now()`,
      [grund],
    );
  }
}
