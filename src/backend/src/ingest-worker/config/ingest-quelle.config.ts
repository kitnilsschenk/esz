/**
 * Kennung des Netzservers, den DIESER Worker-Prozess bedient
 * (ADR-0011 D8/O8).
 *
 * Ein Betrieb mit zwei ChirpStacks faehrt zwei Worker-Prozesse mit je eigener
 * Konfiguration; die Kennung unterscheidet sie in der Betriebssicht. Ohne sie
 * waere die Sicht aktiv irrefuehrend: Liefert Netz A weiter und Netz B seit
 * einem Tag nichts, saehe eine zusammengefasste Kennzahl frisch aus.
 */
const DEFAULT_QUELLE_CODE = 'standard';

/** Muss der DB-Form entsprechen (`ck_quelle_status_code_form`, V0039). */
const QUELLE_CODE_FORM = /^[a-z0-9][a-z0-9_-]{0,62}$/;

/**
 * Der Default greift NUR fuer den Ein-Quellen-Betrieb. Sobald ein zweiter
 * Worker laeuft, muessen BEIDE eine eigene Kennung tragen — zwei Prozesse
 * unter `standard` wuerden einander die Statuszeile ueberschreiben, und die
 * Betriebssicht zeigte abwechselnd den einen und den anderen.
 */
export function loadIngestQuelleCode(): string {
  const roh = process.env['EDMS_INGEST_QUELLE_CODE'];
  if (roh === undefined) {
    return DEFAULT_QUELLE_CODE;
  }

  const code = roh.trim();
  if (!QUELLE_CODE_FORM.test(code)) {
    throw new Error(
      `EDMS_INGEST_QUELLE_CODE='${roh}' ist ungueltig — erlaubt sind Kleinbuchstaben, Ziffern, '_' und '-' ` +
        '(erstes Zeichen alphanumerisch, hoechstens 63 Zeichen). Fail-closed (ADR-0011 D8).',
    );
  }
  return code;
}

/**
 * Reduziert eine Broker-URL auf Host und Port — ZUGANGSDATEN WERDEN
 * ENTFERNT.
 *
 * `mqtt://benutzer:geheim@broker.example:8883` wird zu
 * `broker.example:8883`. Das ist kein Schoenheitsfehler-Fix: Der Wert landet
 * in der Datenbank und von dort in der Oberflaeche; ein Passwort im
 * Verbindungsstring waere damit fuer jede Rolle mit `read:monitoring`
 * lesbar. Der DB-CHECK `ck_quelle_status_broker_ohne_credentials` (V0039)
 * ist der Backstop, diese Funktion die erste Linie.
 *
 * Nicht parsbare Eingaben werden NICHT durchgereicht, sondern durch einen
 * Platzhalter ersetzt — lieber „unbekannt" anzeigen als versehentlich einen
 * rohen String mit allem, was darin steht.
 */
const UNBEKANNT = 'unbekannt';

export function brokerHostOhneCredentials(url: string): string {
  try {
    const geparst = new URL(url);
    // `new URL` ist nachsichtig: `irgendwas:::` parst als Protokoll mit
    // LEEREM Hostnamen. Ein leerer Wert verstiesse gegen
    // `ck_quelle_status_broker_nicht_leer` (V0039) — der Herzschlag
    // scheiterte dann still, weil Schreibfehler bewusst nur geloggt werden.
    if (geparst.hostname.length === 0) {
      return UNBEKANNT;
    }
    return geparst.port.length > 0 ? `${geparst.hostname}:${geparst.port}` : geparst.hostname;
  } catch {
    return UNBEKANNT;
  }
}
