import type {
  DecodedMesswert,
  ErwarteterMesskanal,
  GeraetetypDecoder,
  UplinkFrame,
  ZeitstempelQuelle,
} from './geraetetyp-decoder.types';

/**
 * Feldabbildung für den Gerätetyp „DeZem Harvey 2" (ADR-0011 C2, Abbildung
 * in ADR-0011 §5a).
 *
 * **Woher die Zahl kommt (ADR-0011 D2, Variante a):** Nicht aus den Rohbytes,
 * sondern aus dem `object`, das ChirpStack am Geräteprofil bereits dekodiert
 * hat. Dieser Codec rechnet auch die Wandlerfaktoren ein, die in der
 * ChirpStack-Konfiguration stehen und nicht im EDMS — ein eigener Decoder
 * müsste sie spiegeln und liefe beim ersten Wandlertausch auseinander, ohne
 * dass es jemandem auffiele.
 *
 * **Was eingespeist wird: genau EIN Wert.** `sum_in123_kWh` — die Summe der
 * drei Phasen und damit die Wirkarbeit hinter der Systemgrenze
 * (Betreiber-Auskunft, ADR-0011 O7). Die Einzelphasen `in1_kWh`..`in3_kWh`
 * sind in dieser Summe bereits enthalten; sie zusätzlich zu schreiben hieße,
 * dieselbe Energie doppelt zu führen — und wer später über Messkanäle
 * summierte, käme auf den doppelten Verbrauch eines Endkunden. In einem
 * Förder-Nachweis ist das der teuerste Fehler, den diese Datei machen kann.
 *
 * **fPort 10 trägt keine Arbeit** (nur Leistung, Strom, Spannung, Frequenz,
 * cosφ, Temperatur) und liefert deshalb bewusst eine LEERE Liste — kein
 * Fehler, sondern die richtige Antwort auf eine Nachricht ohne Messwert.
 *
 * **Offene Punkte, die diese Datei betreffen:** Die Abbildung stammt aus
 * ZWEI realen Uplinks, nicht aus einer Herstellerdokumentation (ADR-0011
 * §5a). Und ändert jemand den Codec am Geräteprofil, ändern sich die Werte,
 * ohne dass es hier auffällt (ADR-0011 O3).
 */
export class DezemHarvey2Decoder implements GeraetetypDecoder {
  /**
   * Muss dem `geraetetyp` am Zähler entsprechen. Die Registry vergleicht
   * ohne Rücksicht auf Groß-/Kleinschreibung und Randleerzeichen — der Wert
   * ist ein Freitextfeld, das ein Mensch tippt.
   */
  readonly geraetetyp = 'DeZem Harvey 2';

  readonly version = 1;

  /**
   * Die Vorlage für den Messkanal, den ein Zähler dieses Typs braucht.
   * `decode()` unten liest daraus — Vorlage und tatsächliche Ausgabe können
   * damit nicht auseinanderlaufen, und ein Test hält das fest.
   */
  readonly erwarteteKanaele: readonly ErwarteterMesskanal[] = [ENERGIE_KANAL];

  /**
   * Das Gerät sendet keinen eigenen Zeitstempel: `in_ctr_time_elapse` ist
   * eine Laufzeit („[D:186|H:7|M:26|S:49]"), kein Zeitpunkt. Maßgeblich ist
   * daher der Gateway-Empfang.
   */
  readonly zeitstempelQuelle: ZeitstempelQuelle = 'gateway_server';

  decode(frame: UplinkFrame): DecodedMesswert[] {
    if (frame.fPort !== ENERGIE_PORT) {
      // Diagnose-Uplink (fPort 10 und alles Weitere): kein Messwert, kein Fehler.
      return [];
    }

    if (frame.objekt === undefined) {
      throw new Error(
        'DeZem Harvey 2: Der Uplink trägt kein dekodiertes `object`. Am Geräteprofil im Netzserver ist kein ' +
          'Codec hinterlegt — ohne ihn ist der Zählerstand nicht ablesbar (ADR-0011 D2).',
      );
    }

    const roh = frame.objekt[ENERGIE_FELD];
    if (typeof roh !== 'number' || !Number.isFinite(roh)) {
      throw new Error(
        `DeZem Harvey 2: Feld '${ENERGIE_FELD}' fehlt im dekodierten Uplink oder ist keine Zahl. Ein Uplink auf ` +
          `fPort ${String(ENERGIE_PORT)} ohne Zählerstand ist unerwartet (ADR-0011 §5a).`,
      );
    }

    return [
      {
        messgroesse: ENERGIE_KANAL.messgroesse,
        wertRoh: roh,
        einheit: ENERGIE_KANAL.einheit,
        art: ENERGIE_KANAL.art,
      },
    ];
  }
}

/** fPort, auf dem das Gerät die Zählwerke sendet (fPort 10 trägt nur Momentanwerte). */
const ENERGIE_PORT = 30;

/** Summe der drei Phasen — die Verbrauchsgröße, s. Klassen-Dok. */
const ENERGIE_FELD = 'sum_in123_kWh';

/**
 * Muss ZEICHENGENAU mit `energy.messkanal.messgroesse`/`.einheit`/`.art` des
 * zugehörigen Kanals übereinstimmen — sonst landet jeder Uplink in der
 * Quarantäne (`kanal_unbekannt` bzw. `einheit_inkonsistent`). Beim Anlegen
 * tippt ein Mensch diese Felder als Freitext ab; deshalb wird genau dieses
 * Objekt als Vorlage in die Oberfläche gereicht, statt es dort erneut
 * hinzuschreiben.
 */
const ENERGIE_KANAL: ErwarteterMesskanal = {
  messgroesse: 'wirkarbeit',
  einheit: 'kWh',
  art: 'kumulativ_zaehlerstand',
  beschreibung: 'Wirkarbeit über alle drei Phasen (Summenzählwerk)',
};
