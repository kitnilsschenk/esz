export interface IngestMqttOptions {
  readonly url: string;
  readonly clientId: string;
  readonly topic: string;
  readonly username?: string;
  readonly password?: string;
  /**
   * TLS-Material, PEM. Kommt seit V0059 aus der gepflegten Datenquelle
   * (`IngestQuelleKonfigService`), nicht aus der Umgebung — ein Zertifikat
   * ueber eine Umgebungsvariable zu reichen war schon immer unpraktisch, und
   * genau daran scheiterte das Anbinden eines Netzes ohne Zugriff auf die
   * Maschine des Workers.
   */
  readonly ca?: string;
  readonly cert?: string;
  readonly key?: string;
}

const DEFAULT_CLIENT_ID = 'edms-ingest-worker';

/**
 * Standard-Topic-Template von ChirpStack v4
 * (`application/{{application_id}}/device/{{dev_eui}}/event/{{event}}`), auf
 * den Uplink eingeschraenkt — ADR-0005 §14 (D2): GENAU EIN Wildcard-Abo.
 */
export const DEFAULT_UPLINK_TOPIC = 'application/+/device/+/event/up';

/**
 * Bis ADR-0011 C1 war das Topic eine Konstante. Ein fremder ChirpStack kann
 * sein Template aber frei setzen (Tenant-Praefix, Region) — passte es nicht,
 * kam STILLSCHWEIGEND nichts an: Das Abo lief ins Leere, ohne Fehler, ohne
 * Log. Diese Fehlerart ist zu leise, um sie stehen zu lassen.
 *
 * Ein leer gesetzter Wert ist ein Konfigurationsfehler und KEIN Grund, still
 * auf den Default zurueckzufallen — sonst abonniert der Worker etwas
 * anderes, als in der Konfiguration steht.
 */
function parseTopic(raw: string | undefined): string {
  if (raw === undefined) {
    return DEFAULT_UPLINK_TOPIC;
  }
  const topic = raw.trim();
  if (topic.length === 0) {
    throw new Error(
      'EDMS_INGEST_MQTT_TOPIC ist gesetzt, aber leer — fail-closed (ADR-0011 C1). Variable entfernen, um den ' +
        `Standard '${DEFAULT_UPLINK_TOPIC}' zu verwenden.`,
    );
  }
  return topic;
}

/**
 * ADR-0005 §17 (D5, SEC-2) — Credentials/Broker-Adresse AUSSCHLIESSLICH aus
 * ENV (`.claude/rules/backend-nestjs.md` "iot"-Regel) — NIE im Code/Repo.
 * Username/Passwort ist per ADR-0005 §17 EXPLIZIT nur ein
 * synthetic-only-Dev-Fallback (`EDMS_INGEST_BROKER_MODE=synthetic`) — im
 * produktiven Pfad ist mTLS vorgesehen (Client-Zertifikat, Rotationsmechanismus
 * = Phase-4/devops-lead-Folgeauftrag, NICHT Teil dieses Codestands, s.
 * Auslieferungsbericht Aufgabe F). Diese Funktion liest daher bewusst NUR
 * die synthetic-only-taugliche Teilmenge (URL + optionale Username/Passwort) —
 * TLS-Client-Zertifikat-Optionen sind ein spaeterer, additiver Ausbau
 * (`MqttSubscriberAdapter` liest `ca`/`cert`/`key` NICHT in diesem Paket).
 */
export function loadIngestMqttOptions(): IngestMqttOptions {
  const url = process.env['EDMS_INGEST_MQTT_URL'];
  if (url === undefined || url.length === 0) {
    throw new Error(
      'EDMS_INGEST_MQTT_URL ist nicht gesetzt — der Ingest-Worker braucht eine MQTT-Broker-Adresse ' +
        '(ADR-0005 §14/§17). Fail-closed: harter Fehlstart statt eines impliziten Fallbacks.',
    );
  }

  const clientId = process.env['EDMS_INGEST_MQTT_CLIENT_ID'] ?? DEFAULT_CLIENT_ID;
  const topic = parseTopic(process.env['EDMS_INGEST_MQTT_TOPIC']);
  const username = process.env['EDMS_INGEST_MQTT_USERNAME'];
  const password = process.env['EDMS_INGEST_MQTT_PASSWORD'];

  return {
    url,
    clientId,
    topic,
    ...(username !== undefined && username.length > 0 ? { username } : {}),
    ...(password !== undefined && password.length > 0 ? { password } : {}),
  };
}
