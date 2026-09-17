import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Propagation, Transactional } from '@nestjs-cls/transactional';
import { IngestFreigabeRepository } from './ingest-freigabe.repository';
import { pruefeIngestFreigabe } from './ingest-freigabe-regel';
import { SyntheticOnlyConfigService } from './synthetic-only.config';

/** Der beim Deploy mitgegebene Fingerabdruck des Nachweis-Aktenstands. */
export const EDMS_INGEST_FREIGABE_FINGERABDRUCK = 'EDMS_INGEST_FREIGABE_FINGERABDRUCK';

/**
 * Fail-closed-Prüfung des Ingest-Gate-Markers beim Start (ADR-0008 §22,
 * offener Punkt C3).
 *
 * **Was hier geprüft wird — und warum nicht in der Config.**
 * `SyntheticOnlyConfigService` prüft, was aus Umgebungsvariablen ablesbar
 * ist, und tut das synchron beim Konstruieren. Der Marker steht in der
 * Datenbank; für ihn braucht es eine Abfrage, also einen eigenen Schritt.
 * Muster wie `GoldenVectorBootstrapService`: `OnModuleInit` wirft, Nest
 * bricht den Bootstrap ab, die Anwendung startet nicht.
 *
 * **Bei `EDMS_SYNTHETIC_ONLY=true` passiert hier nichts.** Solange das Gate
 * zu ist, fließen keine echten Personendaten, und eine Freigabe zu verlangen
 * wäre sinnlos — jede Entwicklungs- und Testumgebung müsste sich eine
 * ausstellen, und genau so werden Sicherungen zur Formalie.
 *
 * **Zwei Bedingungen, wenn das Gate offen sein soll:**
 *
 * 1. Es muss eine WIRKSAME Erklärung geben (`art='freigabe'`, nicht
 *    widerrufen). Fehlt sie, startet die Anwendung nicht.
 *
 * 2. Der beim Deploy mitgegebene Fingerabdruck muss zu dem passen, gegen den
 *    erklärt wurde. Das ist der eigentliche Gewinn gegenüber einem bloßen
 *    Ja/Nein: Eine Freigabe gilt für EINEN Stand der Nachweise. Wird später
 *    eine DSFA überarbeitet oder ein AVV-Register geändert, stimmt der
 *    Fingerabdruck nicht mehr — und die Freigabe gilt nicht stillschweigend
 *    weiter, sondern muss neu erklärt werden. Ohne diese Bindung wäre der
 *    Marker eine Unterschrift auf einem Blankoblatt.
 *
 * **Was hier NICHT geprüft wird und auch nicht kann.** Ob ein AVV wirklich
 * geschlossen, ein Hoster wirklich in Deutschland, eine DSFA wirklich
 * vollständig ist. Das sind Verträge, Standorte und Dokumente. Der Marker
 * hält eine ERKLÄRUNG fest — wer wann unter Verweis auf welches Dokument und
 * gegen welchen Stand erklärt hat —, unveränderlich und mit Audit-Ereignis.
 * Eine Software, die behauptete, mehr zu prüfen, erzeugte Vertrauen, das sie
 * nicht verdient.
 *
 * **Betreiberlokal, nicht herstellerseitig.** Der Marker liegt in der
 * Datenbank DES BETREIBERS und trägt DESSEN Nachweise. Diese Software
 * erscheint unter Apache-2.0; ein Riegel, der gegen die Compliance-Akte des
 * Herstellers prüfte, wäre für jeden anderen Betreiber sinnlos bis schädlich.
 */
@Injectable()
export class IngestFreigabeBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(IngestFreigabeBootstrapService.name);

  constructor(
    private readonly config: SyntheticOnlyConfigService,
    private readonly repository: IngestFreigabeRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.syntheticOnly) {
      // Gate zu — es fließen keine echten Personendaten. Nichts zu prüfen.
      // Bewusst VOR der Transaktionsklammer: Im Regelfall soll dieser Start
      // gar keine Datenbankverbindung anfassen.
      return;
    }
    await this.pruefeMarker();
  }

  // Muster `GoldenVectorBootstrapService`: die Transaktionsklammer sitzt an
  // der eigenen Methode, nicht am Lifecycle-Hook.
  @Transactional(Propagation.Required)
  private async pruefeMarker(): Promise<void> {
    const stand = await this.repository.leseStand();

    // Die Regeln selbst stehen in `ingest-freigabe-regel.ts` — rein,
    // ohne Nest und ohne Datenbank, und dort geprueft. Dieser Service holt
    // den Stand und protokolliert; entscheiden tut die Regel.
    pruefeIngestFreigabe(stand, process.env[EDMS_INGEST_FREIGABE_FINGERABDRUCK]);

    // Ab hier ist `stand` zwangslaeufig gesetzt und wirksam — sonst haette
    // die Regel geworfen.
    // Kein Personenbezug im Log: Funktion und Aktenzeichen, kein Name.
    this.logger.log(
      `Ingest-Gate offen. Freigabe vom ${stand?.erklaertAt.toISOString() ?? '?'}, erklaert durch ` +
        `${stand?.attestiertDurch ?? '(unbekannt)'}, Beleg ${stand?.freigabeRef ?? '(keiner)'}.`,
    );
  }
}
