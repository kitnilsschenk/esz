/**
 * ADR-0005 §23 (D11, F3) — Decoder-Vertrag. Versionierte, CODE-BASIERTE
 * Registry (kein DB-konfigurierbares Mapping in v1 — "Vertrauensanker,
 * Herkunft im Git nachweisbar").
 *
 * **TD-2 (Blocker, geloest)** — `zeitstempelQuelle` ist ein STATISCHES
 * Decoder-Attribut, KEIN Per-Uplink-Parameter: ein Decoder-Eintrag
 * deklariert genau EINE Zeitstempel-Quelle fuer ALLE von ihm decodierten
 * Uplinks. Deklariert ein Decoder `zeitstempelQuelle='geraet'`, MUSS jeder
 * von ihm decodierte Messwert `deviceTimestampIso` liefern — fehlt es oder
 * ist es implausibel, ist das Dead-Letter `zeitstempel_fehlt` (KEIN stiller
 * Fallback auf Serverzeit, s. `plausibilitaet.util.ts#resolveZeitstempel`).
 */
/**
 * Was von einem Uplink beim Decoder ankommt.
 *
 * Hiess bis ADR-0011 D2 `RohFrame` und trug nur die Rohbytes. Seit die Werte
 * aus dem von ChirpStack bereits dekodierten `object` stammen duerfen, ist
 * der Inhalt nicht mehr durchgehend roh — der alte Name haette darueber
 * hinweggetaeuscht.
 *
 * `data` und `objekt` sind BEIDE optionaler Herkunft je Decoder:
 * `synthetisch-referenz-v1` liest die Bytes, `dezem-harvey-2` die
 * Feldabbildung. Welcher Weg gilt, sagt der jeweilige Decoder — nicht diese
 * Struktur.
 */
export interface UplinkFrame {
  readonly data: Buffer;
  readonly fPort: number;
  /**
   * Das von ChirpStack am Geraeteprofil dekodierte `object` (ADR-0011 D2,
   * Variante a). `undefined`, wenn am Profil kein Codec hinterlegt ist — ein
   * Decoder, der darauf baut, MUSS das als Fehler behandeln und nicht still
   * nichts liefern.
   */
  readonly objekt?: Record<string, unknown>;
}

export type MessgroesseArt = 'kumulativ_zaehlerstand' | 'intervall_verbrauch';

export interface DecodedMesswert {
  readonly messgroesse: string;
  readonly obisKennzahl?: string;
  readonly wertRoh: number;
  readonly einheit: string;
  readonly art: MessgroesseArt;
  readonly deviceTimestampIso?: string;
}

export type ZeitstempelQuelle = 'geraet' | 'gateway_server';

/**
 * Ein Messkanal, den ein Geraetetyp befuellen WIRD — die Vorlage fuer das
 * Anlegen am Zaehler (Geraetetyp-Katalog, ADR-0011).
 *
 * Warum das AM DECODER haengt und nicht in einer Liste daneben: Die Werte
 * muessen ZEICHENGENAU mit `energy.messkanal.messgroesse`/`.einheit`/`.art`
 * uebereinstimmen, sonst landet jeder Uplink in der Quarantaene
 * (`kanal_unbekannt` bzw. `einheit_inkonsistent`). Beim Anlegen tippt ein
 * Mensch diese Felder als Freitext ab. Eine zweite, danebenliegende Liste
 * waere frueher oder spaeter von dem abgewichen, was der Decoder tatsaechlich
 * liefert — und die Abweichung haette niemand bemerkt, bis Messwerte
 * ausbleiben.
 *
 * Der Katalog wird deshalb AUS den Decodern gelesen.
 */
export interface ErwarteterMesskanal {
  readonly messgroesse: string;
  readonly einheit: string;
  readonly art: MessgroesseArt;
  /** Kurzer Klartext fuer die Oberflaeche — was dieser Kanal fachlich fuehrt. */
  readonly beschreibung: string;
}

export interface GeraetetypDecoder {
  readonly geraetetyp: string;
  readonly version: number;
  readonly zeitstempelQuelle: ZeitstempelQuelle;
  /**
   * Welche Messkanaele dieser Geraetetyp befuellt — die Vorlage fuer das
   * Anlegen am Zaehler (Geraetetyp-Katalog, ADR-0011). Leer bedeutet: Der Typ
   * liefert keine Kanaele, die vorher anzulegen waeren.
   */
  readonly erwarteteKanaele: readonly ErwarteterMesskanal[];
  /**
   * Wirft bei JEDEM strukturellen Problem (kaputtes JSON, fehlendes
   * Pflichtfeld, falscher Typ) — der Aufrufer (`IngestFlowService`) faengt
   * JEDE Exception pro Uplink ab und wandelt sie in eine `decode_fehler`-
   * Quarantaene-Zeile (§23: "niemals eine unbehandelte Exception den Worker
   * crashen lassen").
   */
  decode(rohframe: UplinkFrame): DecodedMesswert[];
}
