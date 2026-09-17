import { Injectable } from '@nestjs/common';
import { IngestFlowService } from '../ingest-flow/ingest-flow.service';
import { IngestMetricsService } from '../ingest-flow/ingest-metrics.service';
import { EnvelopeParseError, parseUplinkEnvelope } from '../ingest-flow/envelope-parser.util';
import type { IngestReasonCode } from '../ingest-flow/reason-code';

/** Was ein Nachlauf getan hat — die Bilanz, die das Kommando ausgibt. */
export interface NachlaufBilanz {
  readonly modus: 'probelauf' | 'ausfuehrung';
  readonly zeilenGelesen: number;
  /** Leerzeilen — kein Fehler, sie werden übergangen. */
  readonly zeilenLeer: number;
  /**
   * Zeilen, die schon der Envelope-Parser abweist. Im PROBELAUF der
   * wichtigste Wert: Er sagt, ob die Datei überhaupt taugt, BEVOR
   * irgendetwas geschrieben wird.
   */
  readonly zeilenUnlesbar: number;
  /** Zeilen, die in die Pipeline gegangen sind (nur bei `ausfuehrung`). */
  readonly uplinksVerarbeitet: number;
  readonly messwerteGeschrieben: number;
  readonly quarantaene: number;
  readonly quarantaeneJeGrund: ReadonlyMap<IngestReasonCode, number>;
  /** Zeilennummern der ersten unlesbaren Zeilen — zum Nachsehen in der Datei. */
  readonly ersteUnlesbareZeilen: readonly number[];
}

/** Wie viele Zeilennummern höchstens gemeldet werden — eine Liste, keine zweite Datei. */
const MAX_GEMELDETE_ZEILEN = 20;

/**
 * Der Nachlauf — Messwerte aus einer Datei aufnehmen statt aus dem Broker.
 *
 * **Warum es ihn braucht.** `herkunft='backfill'` existierte im Datenmodell
 * (ADR-0005 §21 D9), die Plausibilitätsprüfung behandelte sie seit dem
 * 2026-09-08 richtig (Zeitfenster nur nach vorn), und der Schreibpfad war
 * geprüft — **es gab nur keinen Aufrufer außer Tests**. Damit war die
 * Herkunft im Code vorhanden und im Betrieb nicht verwendbar. Genau
 * dieselbe Lücke wie beim Retention-Runner: zwischen fertigem Dienst und
 * Betrieb.
 *
 * Gebraucht wird er bei jedem Netzausfall des Netzservers, bei der Übernahme
 * eines Zählerbestands und immer dann, wenn ein Gerät seine Werte
 * gesammelt nachliefert.
 *
 * **Format: eine JSON-Zeile je Uplink** (NDJSON), Inhalt genau der
 * ChirpStack-Envelope, den auch der Broker liefert. Kein eigenes
 * Austauschformat: Wer einen Ausfall nacharbeitet, hat den Envelope, und
 * eine Umwandlung dazwischen wäre eine zusätzliche Stelle, an der Werte
 * verlorengehen können.
 *
 * **Der Probelauf schreibt nichts.** Er parst und zählt — dieselbe Linie wie
 * beim Retention-Runner. Eine Datei mit tausend unlesbaren Zeilen ist ein
 * Befund, kein Grund weiterzumachen.
 *
 * **Wiederholung ist unschädlich.** Der Schreibpfad ist idempotent
 * (Upsert auf `(messkanal, zeitstempel)`); ein zweiter Nachlauf über
 * dieselbe Datei erzeugt keine Dubletten. Das ist wichtig, weil der
 * Regelfall genau das ist: erst ein Teil, dann noch einmal alles.
 */
@Injectable()
export class NachlaufService {
  constructor(
    private readonly ingestFlowService: IngestFlowService,
    private readonly metrics: IngestMetricsService,
  ) {}

  /**
   * @param zeilen Zeilen der Datei, in Lesereihenfolge. Als `AsyncIterable`,
   *   damit der Aufrufer streamen kann — eine Nachlaufdatei über einen
   *   Jahresbestand passt nicht sinnvoll in den Speicher.
   * @param ausfuehren `false` (Standard) parst nur und schreibt nichts.
   */
  async verarbeiteDatei(zeilen: AsyncIterable<string>, ausfuehren: boolean): Promise<NachlaufBilanz> {
    const vorher = this.metrics.snapshot();

    let zeilenGelesen = 0;
    let zeilenLeer = 0;
    let zeilenUnlesbar = 0;
    let uplinksVerarbeitet = 0;
    const ersteUnlesbareZeilen: number[] = [];

    for await (const zeile of zeilen) {
      zeilenGelesen += 1;
      const inhalt = zeile.trim();
      if (inhalt.length === 0) {
        zeilenLeer += 1;
        continue;
      }

      const payload = Buffer.from(inhalt, 'utf8');

      if (!ausfuehren) {
        // Probelauf: GENAU die Prüfung, an der auch die Pipeline als Erstes
        // scheitern würde — keine zweite, abweichende Vorprüfung.
        try {
          parseUplinkEnvelope(payload);
        } catch (fehler: unknown) {
          if (!(fehler instanceof EnvelopeParseError)) {
            throw fehler;
          }
          zeilenUnlesbar += 1;
          if (ersteUnlesbareZeilen.length < MAX_GEMELDETE_ZEILEN) {
            ersteUnlesbareZeilen.push(zeilenGelesen);
          }
        }
        continue;
      }

      // Ausführung: die Zeile geht durch dieselbe Pipeline wie ein
      // Live-Uplink — nur mit `herkunft='backfill'`, damit die
      // Plausibilitätsprüfung das Zeitfenster nur nach vorn anlegt und der
      // Wert seine Herkunft behält.
      //
      // Die Zeilennummer wandert in den redigierten Topic: Sie ist der
      // einzige Hinweis, mit dem sich eine Quarantäne-Zeile später in der
      // Datei wiederfinden lässt. Der DATEINAME steht bewusst NICHT darin —
      // er ist frei gewählt und könnte einen Kundennamen tragen (RL-2).
      await this.ingestFlowService.verarbeiteUplink({
        topicRedacted: `nachlauf/zeile-${String(zeilenGelesen)}`,
        payload,
        herkunft: 'backfill',
      });
      uplinksVerarbeitet += 1;
    }

    const nachher = this.metrics.snapshot();

    return {
      modus: ausfuehren ? 'ausfuehrung' : 'probelauf',
      zeilenGelesen,
      zeilenLeer,
      zeilenUnlesbar,
      uplinksVerarbeitet,
      messwerteGeschrieben: nachher.ingestMesswertGeschriebenTotal - vorher.ingestMesswertGeschriebenTotal,
      ...this.zaehleQuarantaene(vorher.ingestQuarantaeneTotalByGrund, nachher.ingestQuarantaeneTotalByGrund),
      ersteUnlesbareZeilen,
    };
  }

  /**
   * Differenz der Quarantäne-Zähler.
   *
   * Über die Metriken und nicht über einen Rückgabewert der Pipeline: Der
   * Nachlauf läuft in einem EIGENEN Prozess (`nachlauf-main.ts`), in dem
   * kein anderer Uplink unterwegs ist — die Zähler beschreiben damit exakt
   * diesen Lauf. Der Live-Pfad bleibt unangetastet.
   */
  private zaehleQuarantaene(
    vorher: ReadonlyMap<IngestReasonCode, number>,
    nachher: ReadonlyMap<IngestReasonCode, number>,
  ): { readonly quarantaene: number; readonly quarantaeneJeGrund: ReadonlyMap<IngestReasonCode, number> } {
    const jeGrund = new Map<IngestReasonCode, number>();
    let gesamt = 0;

    for (const [grund, anzahl] of nachher) {
      const differenz = anzahl - (vorher.get(grund) ?? 0);
      if (differenz > 0) {
        jeGrund.set(grund, differenz);
        gesamt += differenz;
      }
    }

    return { quarantaene: gesamt, quarantaeneJeGrund: jeGrund };
  }
}
