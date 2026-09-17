import type { DecodedMesswert, ZeitstempelQuelle } from '../decoder/geraetetyp-decoder.types';
import type { IngestHerkunft } from './messwert-codes';
import type { ChirpStackUplinkEnvelope } from './envelope.types';

/**
 * ADR-0005 §20 Schritt 9 (TD-2) — Plausibilitaetsfenster fuer einen
 * Geraete-Zeitstempel um die Empfangszeit (schuetzt gegen grob falsche
 * Geraeteuhren, ohne ein enges, willkuerliches Fenster zu erzwingen).
 * Konkreter Wert = v1-Entscheidung (Auslieferungsbericht), kein ADR-Text-Zitat.
 */
export const ZEITSTEMPEL_PLAUSIBEL_FENSTER_MS = 48 * 60 * 60 * 1000;

function parseIsoOrUndefined(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

function istImPlausiblenFenster(kandidatMs: number, empfangenAt: Date): boolean {
  return Math.abs(kandidatMs - empfangenAt.getTime()) <= ZEITSTEMPEL_PLAUSIBEL_FENSTER_MS;
}

/**
 * ADR-0005 §20 Schritt 9/§23 (TD-2, statisches Decoder-Attribut, KEIN
 * Per-Uplink-Laufzeit-Fallback): `zeitstempelQuelle='geraet'` verlangt
 * `deviceTimestampIso` (Pflicht, sonst `zeitstempel_fehlt` — KEIN stiller
 * Wechsel auf Serverzeit). `zeitstempelQuelle='gateway_server'` nutzt IMMER
 * `rxInfo[0].time` bzw. `time` aus dem Envelope, OHNE Ausnahme.
 *
 * Rueckgabe `undefined` = `zeitstempel_fehlt` (fehlend ODER ausserhalb des
 * Plausibilitaetsfensters, §27 ZEITSTEMPEL_PLAUSIBEL_FENSTER_MS).
 */
/**
 * Zeitstempel aus Sicht des Netzes, in absteigender Verlaesslichkeit:
 * Gateway-Empfang, dann der Envelope-Zeitpunkt.
 *
 * `rxInfo[].gwTime` ist das Feld, das ChirpStack v4 tatsaechlich fuehrt.
 * Zuvor stand hier `rxInfo[].time` — ein Feld, das es in v4 gar nicht gibt:
 * Der Zweig lief immer ins Leere und fiel stumm auf den Envelope-Zeitpunkt
 * zurueck (ADR-0011 O4). Das Ergebnis war meist dasselbe, die Absicht aber
 * nicht: Bei einem Backfill koennen Envelope- und Empfangszeitpunkt weit
 * auseinanderliegen. `time` bleibt als Rueckfallebene fuer aeltere Fassungen
 * erhalten.
 */
function gatewayZeitstempel(envelope: ChirpStackUplinkEnvelope): string | undefined {
  const ersterEmpfang = envelope.rxInfo?.[0];
  return ersterEmpfang?.gwTime ?? ersterEmpfang?.time ?? envelope.time;
}

/**
 * Beim Nachlauf (`herkunft='backfill'`) gilt das Fenster NUR nach vorn.
 *
 * Der Zweck des Fensters ist eine grob falsche Geraeteuhr im Live-Betrieb: Ein
 * Uplink, der eben empfangen wurde, kann keinen Zeitstempel von vor drei
 * Monaten tragen. Beim Nachlauf ist genau das der Normalfall — er traegt
 * absichtlich alte Zeitstempel nach (Gateway-Ausfall, verspaetete
 * Netzzustellung, Uebernahme aus einem Altsystem). Gemessen am
 * EMPFANGSzeitpunkt fiel damit JEDER Nachlauf aelter als 48 Stunden in die
 * Quarantaene `zeitstempel_fehlt` — die Herkunft `backfill` existierte im
 * Code, war praktisch aber nicht verwendbar.
 *
 * Nach vorn bleibt die Grenze bestehen und ist es auch, worauf es ankommt:
 * Ein Messwert, der in der Zukunft liegt, ist in beiden Betriebsarten falsch
 * (er wuerde einen kuenftigen Monat mit Verbrauch fuellen). Das
 * 48-Stunden-Fenster dient hier als Toleranz fuer Uhrenversatz.
 */
function istZeitstempelPlausibel(kandidatMs: number, empfangenAt: Date, herkunft: IngestHerkunft): boolean {
  if (herkunft === 'backfill') {
    return kandidatMs - empfangenAt.getTime() <= ZEITSTEMPEL_PLAUSIBEL_FENSTER_MS;
  }
  return istImPlausiblenFenster(kandidatMs, empfangenAt);
}

export function resolveZeitstempel(
  zeitstempelQuelle: ZeitstempelQuelle,
  messwert: DecodedMesswert,
  envelope: ChirpStackUplinkEnvelope,
  empfangenAt: Date,
  herkunft: IngestHerkunft = 'ingest_live',
): string | undefined {
  const kandidat =
    zeitstempelQuelle === 'geraet' ? messwert.deviceTimestampIso : gatewayZeitstempel(envelope);

  const kandidatMs = parseIsoOrUndefined(kandidat);
  if (kandidatMs === undefined) {
    return undefined;
  }
  if (!istZeitstempelPlausibel(kandidatMs, empfangenAt, herkunft)) {
    return undefined;
  }

  return new Date(kandidatMs).toISOString();
}

/**
 * ADR-0005 §20 Schritt 8 (Wertebereich) — DB-Schema kennt KEINEN eigenen
 * Reason-Code fuer "Wertebereich" (nur die acht `ck_quarantaene_grund`-Werte,
 * V0011); Wertebereichsverstoesse werden daher — wie Monotonie-Verstoesse —
 * auf `unplausibel_monotonie_verletzt` abgebildet (Entscheidung, s.
 * Auslieferungsbericht). Ein negativer oder nicht-endlicher Wert ist fuer
 * BEIDE `art`-Auspraegungen implausibel (auch `intervall_verbrauch` kann
 * nicht negativ sein).
 */
export function istWertebereichPlausibel(wertRoh: number): boolean {
  return Number.isFinite(wertRoh) && wertRoh >= 0;
}

/**
 * ADR-0005 §20 Schritt 8 (Monotonie, NUR `art='kumulativ_zaehlerstand'`) —
 * prüft den neuen Wert gegen seine ZEITLICHEN NACHBARN.
 *
 * Ein Zählerstand darf über die Zeit nicht sinken. Die Aussage gilt in BEIDE
 * Richtungen, und beide werden gebraucht:
 *
 *   - kleiner als der unmittelbare VORGÄNGER  → der Stand ist gefallen.
 *   - größer als der unmittelbare NACHFOLGER  → der Stand ist gefallen,
 *     nur eben nach diesem Wert.
 *
 * **Warum nicht mehr "gegen den zuletzt geschriebenen Wert".** Bis zum
 * 2026-09-09 verglich diese Funktion gegen den jüngsten Wert des Kanals. Für
 * den Live-Pfad ist das identisch — dort ist der neue Wert der jüngste. Für
 * einen Nachlauf ist es falsch: Der nachgereichte Stand vom 1. Januar ist
 * erwartungsgemäß kleiner als der gespeicherte vom 31. Januar und fiel
 * deshalb als „Monotonie verletzt" in die Quarantäne. Betroffen war jeder
 * Nachlauf auf einem nicht leeren Kanal — und damit auch jede Wiederholung
 * eines Nachlaufs (s. `MesswertSchreibpfadRepository.findNachbarwerte`).
 */
export function istMonotonPlausibel(
  wertRoh: number,
  vorheriger: number | undefined,
  naechster: number | undefined,
): boolean {
  if (vorheriger !== undefined && wertRoh < vorheriger) {
    return false;
  }
  if (naechster !== undefined && wertRoh > naechster) {
    return false;
  }
  return true;
}
