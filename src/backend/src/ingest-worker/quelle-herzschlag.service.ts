import { Injectable, Logger, Optional } from '@nestjs/common';
import { QuelleStatusRepository } from './persistence/quelle-status.repository';
import { brokerHostOhneCredentials, loadIngestQuelleCode } from './config/ingest-quelle.config';
import { loadIngestMqttOptions } from './mqtt/ingest-mqtt.config';
import { IngestQuelleKonfigService } from './mqtt/ingest-quelle-konfig.service';

/**
 * Abstand zwischen zwei Herzschlägen. Die Betriebssicht bewertet einen
 * Herzschlag als veraltet, wenn er deutlich älter ist — der Schwellenwert
 * dort ist ein Vielfaches hiervon, damit ein einzelner verzögerter Schlag
 * nicht sofort als Ausfall gilt.
 */
export const HERZSCHLAG_INTERVALL_MS = 30_000;

/**
 * Meldet regelmäßig, dass dieser Worker läuft, worauf er hört und ob seine
 * Verbindung steht (ADR-0011 O8/D8).
 *
 * **Warum das nötig ist:** Der Worker ist ein eigener Prozess. Ohne diese
 * Meldung kann die Plattform weder sagen, ob überhaupt noch jemand zuhört,
 * noch auf welchem Broker und Topic — beides stand bisher ausschließlich in
 * Umgebungsvariablen, die niemand sehen konnte.
 *
 * **Warum der Herzschlag und nicht nur ein Verbindungs-Flag:** Ein
 * abgestürzter Prozess kann sein `verbunden` nicht mehr auf `false` setzen;
 * die Zeile bliebe für immer grün. Erst das Altern des Zeitstempels macht
 * einen Stillstand sichtbar. Deshalb schlägt es auch dann weiter, wenn die
 * Verbindung gerade NICHT steht — ein Herzschlag mit `verbunden=false` ist
 * die Aussage „ich lebe, aber ich komme nicht durch", und die ist wertvoller
 * als Schweigen.
 *
 * Fehler beim Schreiben werden geloggt und verschluckt: Ein Problem mit der
 * Statuszeile darf die Messdaten-Aufnahme nicht anhalten.
 */
@Injectable()
export class QuelleHerzschlagService {
  private readonly logger = new Logger('QuelleHerzschlag');
  private timer: NodeJS.Timeout | undefined;
  private verbunden = false;
  private letzteVerbindungAt: Date | undefined;

  constructor(
    private readonly repository: QuelleStatusRepository,
    // Optional, damit die bestehenden Tests den Dienst ohne Datenbank bauen
    // koennen — ohne ihn gilt die Umgebung wie vor V0059.
    @Optional() private readonly konfigService?: IngestQuelleKonfigService,
  ) {}

  /** Meldet einen erfolgreichen Verbindungsaufbau und startet den Takt. */
  async start(): Promise<void> {
    this.verbunden = true;
    this.letzteVerbindungAt = new Date();
    await this.schreibe();

    this.timer = setInterval(() => {
      void this.schreibe();
    }, HERZSCHLAG_INTERVALL_MS);
    // Der Takt soll den Prozess nicht am Beenden hindern.
    this.timer.unref();
  }

  /** Meldet einen Verbindungsabriss — der Takt läuft weiter, s. Klassen-Dok. */
  async verbindungVerloren(): Promise<void> {
    this.verbunden = false;
    await this.schreibe();
  }

  /** Meldet den geordneten Rückzug: nicht mehr verbunden, danach kein Takt mehr. */
  async stop(): Promise<void> {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.verbunden = false;
    await this.schreibe();
  }

  private async schreibe(): Promise<void> {
    try {
      // DIESELBE Quelle wie beim Verbindungsaufbau. Läse der Herzschlag
      // weiterhin die Umgebung, meldete die Betriebssicht einen anderen
      // Broker als den, mit dem der Worker tatsächlich spricht — und genau
      // dieser Zeile glaubt man beim Suchen einer Störung.
      const mqtt = this.konfigService !== undefined ? await this.konfigService.ladeOptionen() : loadIngestMqttOptions();
      await this.repository.upsert({
        quelleCode: loadIngestQuelleCode(),
        brokerHost: brokerHostOhneCredentials(mqtt.url),
        topic: mqtt.topic,
        clientId: mqtt.clientId,
        verbunden: this.verbunden,
        ...(this.letzteVerbindungAt !== undefined ? { letzteVerbindungAt: this.letzteVerbindungAt } : {}),
      });
    } catch (fehler: unknown) {
      // Bewusst nur geloggt: Die Statuszeile ist Diagnose, nicht Fachdaten.
      this.logger.warn(`Herzschlag konnte nicht geschrieben werden: ${String(fehler)}`);
    }
  }
}
