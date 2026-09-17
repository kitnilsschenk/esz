import { Injectable, Logger, Optional } from '@nestjs/common';
import mqtt from 'mqtt';
import type { IClientOptions, IPublishPacket, MqttClient } from 'mqtt';
import { loadIngestMqttOptions } from './ingest-mqtt.config';
import { IngestQuelleKonfigService } from './ingest-quelle-konfig.service';
import { redigiereMqttTopic } from './mqtt-topic-redaction.util';
import { MQTT_BACKOFF_INITIAL_MS, naechsteBackoffWartezeitMs } from './mqtt-backoff.util';
import { assertKeinMqttDebugLeckrisiko } from './mqtt-debug-env-guard.util';
import { UPLINK_QOS } from './mqtt-subscriber.port';
import type { MqttSubscriberPort, MqttUplinkMessage, UplinkHandler } from './mqtt-subscriber.port';
import { IngestLoggerService } from '../ingest-flow/ingest-logger.service';

export type MqttConnectFn = (url: string, options: IClientOptions) => MqttClient;

/**
 * ADR-0005 §14/§15/§17/§22 (D2-D5, D10) — `mqtt`-basierter Adapter.
 *
 * **"Ack nach Commit" (§15/§20 Schritt 12), TATSAECHLICH umgesetzt (nicht
 * nur die `mqtt`-Bibliotheks-Default-Semantik):** `mqtt.js` sendet unter
 * MQTT 3.1.1 per Default den PUBACK fuer eine QoS-1-Nachricht SOFORT nach
 * `MqttClient.handleMessage(packet, callback)` — normalerweise SYNCHRON,
 * ohne auf eine asynchrone Verarbeitung zu warten. Dieser Adapter
 * UEBERSCHREIBT `client.handleMessage` auf der Instanz (dokumentierter
 * Erweiterungspunkt der Bibliothek) und haelt den `callback` zurueck, bis
 * `handler(message)` (die gesamte Ingest-Flow-Verarbeitung inkl. DB-Commit)
 * abgeschlossen ist — ERST DANN wird `callback()` aufgerufen und damit der
 * PUBACK gesendet. `mqtt.js` verarbeitet eingehende Pakete SEQUENZIELL (das
 * naechste Paket wird erst nach `callback()` des aktuellen geparst) — das
 * ergibt zugleich die in §15 vorgeschlagene "sequenziell, ein Uplink nach
 * dem anderen"-Verarbeitung ohne zusaetzlichen Code.
 *
 * Wirft `handler(message)` (Infra-Fehler, s. `IngestFlowService`-Kommentar
 * "nie crashen" — Business-Fehler werden dort bereits zu Quarantaene-Zeilen
 * und werfen NICHT), ruft dieser Adapter `callback(error)` auf — `mqtt.js`
 * sendet dann KEIN PUBACK fuer diese Nachricht (bleibt beim Broker "in
 * flight", Redelivery bei Reconnect/Broker-Neustart, at-least-once, M3) UND
 * faehrt trotzdem mit der Verarbeitung nachfolgender Pakete fort (kein
 * Absturz, kein Verbindungsabbruch).
 *
 * **SA-4 (Phase-5-Security-Review, vormals SEC-7-Ops-Runbook-Hinweis,
 * ADR-0005 §22) — JETZT TECHNISCH ERZWUNGEN, nicht mehr nur dokumentiert:**
 * das `mqtt`-Paket nutzt intern das `debug`-npm-Modul (`DEBUG=mqtt*`-
 * Umgebungsvariable): Debug-Logs eines MQTT-Clients koennen rohe Topic-/
 * Payload-Fragmente ausgeben und damit die Log-Redaction dieses Adapters
 * (RL-2) UMGEHEN. `assertKeinMqttDebugLeckrisiko()` (s. Konstruktor) prueft
 * das bereits beim Konstruieren dieser Klasse — also WAEHREND Nest den
 * Objektgraphen aufbaut (`NestFactory.createApplicationContext`), NOCH VOR
 * dem tatsaechlichen Verbindungsaufbau in `start()` — und wirft fail-closed,
 * statt sich (wie zuvor) allein auf ein Ops-Runbook/Deployment-Manifest zu
 * verlassen.
 */
@Injectable()
export class MqttSubscriberAdapter implements MqttSubscriberPort {
  private readonly logger = new Logger('IngestMqttSubscriber');
  private readonly connectFn: MqttConnectFn;
  private readonly ingestLogger: IngestLoggerService;
  private client: MqttClient | undefined;
  private handler: UplinkHandler | undefined;
  private backoffMs = MQTT_BACKOFF_INITIAL_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private stopping = false;

  /**
   * `@Optional()` (Nest-DI, NICHT nur TS-Default): ohne diesen Decorator
   * wuerde Nest beim `useClass`-Aufloesen versuchen, einen Provider fuer den
   * (Funktions-)Typ `MqttConnectFn` zu finden und werfen ("Nest can't
   * resolve dependencies ..."). Mit `@Optional()` injiziert Nest `undefined`
   * (kein passender Provider), der JS-Defaultwert greift dann normal — in
   * Tests wird die Klasse ohnehin per `new MqttSubscriberAdapter(fakeFn)`
   * direkt konstruiert (kein Nest-DI involviert).
   *
   * `ingestLogger` (QA-3-Nacharbeit) folgt demselben `@Optional()`-Muster:
   * ueber Nest-DI kommt die ECHTE, geteilte `IngestLoggerService`-Instanz
   * (bereitgestellt/exportiert von `IngestPersistenceModule`, s. `mqtt.
   * module.ts`); direkt konstruierte Tests (`new MqttSubscriberAdapter(fn)`,
   * ohne zweites Argument) bekommen eine lokale Default-Instanz — ebenfalls
   * zustandslos, funktional aequivalent.
   *
   * SA-4: `assertKeinMqttDebugLeckrisiko()` laeuft HIER, ALLERERSTES im
   * Konstruktor — noch VOR der `connectFn`/`ingestLogger`-Zuweisung — fail-
   * closed, falls `DEBUG` ein `mqtt*`-Risiko traegt (s. Klassen-Kommentar).
   */
  constructor(
    @Optional() connectFn?: MqttConnectFn,
    @Optional() ingestLogger?: IngestLoggerService,
    // Optional, damit die bestehenden Tests den Adapter weiterhin ohne
    // Datenbank bauen koennen — ohne den Dienst gilt die Umgebung wie vor V0059.
    @Optional() private readonly konfigService?: IngestQuelleKonfigService,
  ) {
    assertKeinMqttDebugLeckrisiko();
    this.connectFn = connectFn ?? mqtt.connect;
    this.ingestLogger = ingestLogger ?? new IngestLoggerService();
  }

  async start(handler: UplinkHandler): Promise<void> {
    this.handler = handler;
    this.stopping = false;
    const options = this.konfigService !== undefined ? await this.konfigService.ladeOptionen() : loadIngestMqttOptions();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const client = this.connectFn(options.url, {
        clientId: options.clientId,
        clean: false, // persistente Session (§14/§15) — Broker behaelt QoS-1-Nachrichten bei Trennung.
        reconnectPeriod: 0, // eigenes exponentielles Backoff statt Fixintervall, s. mqtt-backoff.util.ts
        ...(options.username !== undefined ? { username: options.username } : {}),
        ...(options.password !== undefined ? { password: options.password } : {}),
        // TLS-Material aus der gepflegten Quelle (V0059). `mqtt.connect`
        // erwartet die PEM-Bloecke direkt; ohne sie bleibt die Verbindung
        // unverschluesselt — was der TLS-Modus `kein_tls` genau aussagt.
        ...(options.ca !== undefined ? { ca: options.ca } : {}),
        ...(options.cert !== undefined ? { cert: options.cert } : {}),
        ...(options.key !== undefined ? { key: options.key } : {}),
      });
      this.client = client;
      this.installHandleMessageOverride(client);

      client.on('connect', () => {
        this.backoffMs = MQTT_BACKOFF_INITIAL_MS; // Backoff nach erfolgreichem (Re-)Connect zuruecksetzen.
        client.subscribe(options.topic, { qos: UPLINK_QOS }, (err) => {
          if (err) {
            this.logger.error(`MQTT-Subscribe fehlgeschlagen: ${err.message}`);
            if (!settled) {
              settled = true;
              reject(err);
            }
            return;
          }
          if (!settled) {
            settled = true;
            resolve();
          }
        });
      });

      client.on('close', () => {
        if (this.stopping) {
          return;
        }
        this.scheduleReconnect();
      });

      client.on('error', (error) => {
        this.logger.error(`MQTT-Client-Fehler: ${error.message}`);
        if (!settled) {
          settled = true;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }

  private installHandleMessageOverride(client: MqttClient): void {
    client.handleMessage = (packet: IPublishPacket, callback: (error?: Error) => void): void => {
      // `IPublishPacket.payload` ist laut `mqtt-packet`-Typ `string | Buffer`
      // (in der Praxis liefert der Parser fuer eingehende Publishes immer
      // Buffer — die String-Variante ist nur in anderen mqtt.js-Kontexten
      // moeglich). Defensive Normalisierung, kein `any`.
      const payload = Buffer.isBuffer(packet.payload) ? packet.payload : Buffer.from(packet.payload, 'utf8');
      const message: MqttUplinkMessage = {
        topicRedacted: redigiereMqttTopic(packet.topic),
        payload,
      };

      this.verarbeiteMitAckKontrolle(message, callback);
    };
  }

  private verarbeiteMitAckKontrolle(message: MqttUplinkMessage, callback: (error?: Error) => void): void {
    const handler = this.handler;
    if (handler === undefined) {
      callback();
      return;
    }

    handler(message)
      .then(() => {
        callback();
      })
      .catch((error: unknown) => {
        // "nie crashen" (ADR-0005 §23) — geloggt, KEIN PUBACK (at-least-once
        // Redelivery), Worker/Verbindung bleibt bestehen.
        //
        // QA-3-Nacharbeit (Phase-5-Review): ueber `IngestLoggerService.
        // infraFehler()` (PII-sichere Feld-Whitelist, s. dortiger Kommentar)
        // statt ueber den rohen `Logger.error` — dieselbe Stelle, die
        // `IngestFlowService`s Kommentar als "der einzige Infrastruktur-
        // Fehlerpfad, den der Adapter abfaengt" beschreibt.
        this.ingestLogger.infraFehler('mqtt_uplink_verarbeitung_fehlgeschlagen', error);
        callback(error instanceof Error ? error : new Error('unbekannter Fehler bei der Uplink-Verarbeitung'));
      });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== undefined) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.backoffMs = naechsteBackoffWartezeitMs(this.backoffMs);
      this.client?.reconnect();
    }, this.backoffMs);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    const client = this.client;
    if (client === undefined) {
      return;
    }

    await new Promise<void>((resolve) => {
      client.end(false, {}, () => resolve());
    });
  }
}
