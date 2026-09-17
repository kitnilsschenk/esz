import type { ChirpStackUplinkEnvelope, RxInfoEintrag } from './envelope.types';

/**
 * SA-2/PE-11 (Phase-5-Security-/Performance-Review) — harte Byte-Obergrenze
 * VOR jedem `JSON.parse`-Aufruf. Ohne sie kann ein ueberdimensionierter
 * MQTT-Payload (versehentlich oder mutwillig) den `JSON.parse`-Aufruf selbst
 * beliebig lange/teuer machen — kombiniert mit "Ack nach Commit" (§15/§20
 * Schritt 12) UND strikt sequenzieller Verarbeitung blockiert das den
 * GESAMTEN Worker; und weil ein nicht-geackter Uplink beim Broker "in
 * flight" bleibt (at-least-once, M3), wird derselbe ueberdimensionierte
 * Payload bei jedem Reconnect erneut zugestellt (Redelivery verstaerkt den
 * Effekt statt ihn zu daempfen). Realistische ChirpStack-Uplink-Envelopes
 * (`deviceInfo` + `data` + `rxInfo` mit i. d. R. wenigen Gateways) liegen
 * WEIT unter dieser Grenze — 64 KiB ist grosszuegig genug, um auch ein
 * Envelope mit ungewoehnlich vielen `rxInfo`-Eintraegen (Multi-Gateway-
 * Empfang) klaglos durchzulassen, aber endlich genug, um einen pathologisch
 * grossen Payload VOR dem teuren Parse abzulehnen. Verstoss => SEC-1-
 * Sonderform der Quarantaene (nur Laenge+Hash, s. `EnvelopeParseError`
 * unten) — KEIN Unterschied zu jedem anderen strukturellen Parse-Fehler.
 */
export const MAX_ENVELOPE_PAYLOAD_BYTES = 64 * 1024;

/**
 * ADR-0005 §20 Schritt 2/6 — generische Fehlermeldung, NIEMALS ein
 * Payload-Fragment (verhindert ein versehentliches Log-Leak über
 * Stacktraces/Fehlerkontext, RL-2).
 */
export class EnvelopeParseError extends Error {
  constructor() {
    super('Envelope konnte nicht strukturiert geparst werden (envelope_parse_fehler).');
    this.name = 'EnvelopeParseError';
  }
}

function istRxInfoEintrag(value: unknown): value is RxInfoEintrag {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const eintrag = value as Record<string, unknown>;
  const time = eintrag['time'];
  const gwTime = eintrag['gwTime'];
  return (
    (time === undefined || typeof time === 'string') && (gwTime === undefined || typeof gwTime === 'string')
  );
}

/**
 * ADR-0005 §20 Schritt 2 (SEC-1) — parst den rohen MQTT-Payload als
 * ChirpStack-Envelope. Wirft `EnvelopeParseError` bei JEDEM strukturellen
 * Problem (kaputtes JSON, fehlendes `deviceInfo.devEui`, falscher Typ) —
 * der Aufrufer (`IngestFlowService`) faengt das ab und schreibt die
 * SEC-1-Sonderform der Quarantaene (nur Laenge+Hash, KEIN redigiertes JSON,
 * da an dieser Stelle kein valides Objekt existiert).
 */
export function parseUplinkEnvelope(raw: Buffer): ChirpStackUplinkEnvelope {
  // SA-2/PE-11 — VOR dem JSON.parse pruefen (s. Begruendung/Grenzwert oben):
  // nur Laenge wird betrachtet, kein Byte des Payloads selbst.
  if (raw.length > MAX_ENVELOPE_PAYLOAD_BYTES) {
    throw new EnvelopeParseError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new EnvelopeParseError();
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new EnvelopeParseError();
  }
  const obj = parsed as Record<string, unknown>;

  const deviceInfo = obj['deviceInfo'];
  if (typeof deviceInfo !== 'object' || deviceInfo === null) {
    throw new EnvelopeParseError();
  }
  const deviceInfoObj = deviceInfo as Record<string, unknown>;
  const devEui = deviceInfoObj['devEui'];
  if (typeof devEui !== 'string' || devEui.length === 0) {
    throw new EnvelopeParseError();
  }
  // Herkunfts-Kennungen sind OPTIONAL: Ein Netzserver, der sie nicht
  // mitsendet, darf deswegen nicht abgewiesen werden. NUR IDs, keine Namen
  // (s. `DeviceInfo`-Dok).
  const tenantId = deviceInfoObj['tenantId'];
  const applicationId = deviceInfoObj['applicationId'];

  const fPort = obj['fPort'];
  if (typeof fPort !== 'number') {
    throw new EnvelopeParseError();
  }

  const data = obj['data'];
  if (typeof data !== 'string') {
    throw new EnvelopeParseError();
  }

  // `object` ist optional: Ohne Codec am Geraeteprofil fehlt es. Ein Decoder,
  // der darauf baut, meldet das selbst als `decode_fehler` — hier wird es nur
  // durchgereicht, nicht bewertet.
  const objektRaw = obj['object'];
  const objekt =
    typeof objektRaw === 'object' && objektRaw !== null && !Array.isArray(objektRaw)
      ? (objektRaw as Record<string, unknown>)
      : undefined;
  const time = obj['time'];
  const fCnt = obj['fCnt'];
  const rxInfoRaw = obj['rxInfo'];
  const rxInfo = Array.isArray(rxInfoRaw) && rxInfoRaw.every(istRxInfoEintrag) ? rxInfoRaw : undefined;

  return {
    deviceInfo: {
      devEui,
      ...(typeof tenantId === 'string' && tenantId.length > 0 ? { tenantId } : {}),
      ...(typeof applicationId === 'string' && applicationId.length > 0 ? { applicationId } : {}),
    },
    fPort,
    data,
    ...(objekt !== undefined ? { objekt } : {}),
    ...(typeof time === 'string' ? { time } : {}),
    ...(rxInfo !== undefined ? { rxInfo } : {}),
    ...(typeof fCnt === 'number' ? { fCnt } : {}),
  };
}
