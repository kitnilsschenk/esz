/**
 * ADR-0005 §20 Schritt 2/§14 — ChirpStack-Uplink-Envelope (v3/v4-Konvention,
 * nur die vom Ingest-Flow tatsaechlich benoetigten Felder). `deviceInfo.
 * devEui` ist die EINZIGE kanonische DevEUI-Quelle (TD-7, NIEMALS aus dem
 * Topic-String, §14).
 */
/**
 * Empfangs-Metadaten eines Gateways. ChirpStack v4 fuehrt hier `gwTime`
 * (Gateway-Empfang) und `nsTime` (Netzserver); ein Feld `time` gibt es NICHT
 * — es stammt aus aelteren Fassungen und wird nur noch der Vollstaendigkeit
 * halber gelesen (ADR-0011 O4).
 *
 * Bewusst NICHT gelesen: `location` (Gateway-Koordinaten). Sie lokalisiert
 * faktisch das Gebaeude und hat im Ingest-Pfad nichts zu suchen.
 */
export interface RxInfoEintrag {
  /** ChirpStack v4 — Empfangszeitpunkt des Gateways. */
  readonly gwTime?: string;
  /** Aeltere Fassungen. Bleibt als Rueckfallebene erhalten. */
  readonly time?: string;
}

/**
 * Was aus `deviceInfo` gelesen wird (ADR-0011 D1).
 *
 * **NUR die opaken Kennungen, KEINE Namen.** ChirpStack liefert daneben
 * `tenantName`, `applicationName`, `deviceName` und `tags` — Freitext, den
 * jemand in einem FREMDEN System getippt hat, ohne Feldkatalog und ohne
 * Loeschkonzept. Im Beispielbeleg lautete `applicationName` "GS Lahnstein"
 * (faktisch eine Anschrift) und `tags.consumerName` "Lueftung EG"; in einem
 * Wohnkontext stuende dort ebenso gut ein Nachname. Der Ingest-Pfad haelt
 * solche Angaben konsequent draussen (RL-2-Linie), und gebraucht werden sie
 * nicht: Sobald die Application einem `energy.standort` zugeordnet ist
 * (ADR-0011 B2), zeigt die Oberflaeche den EDMS-eigenen Gebaeudenamen.
 */
export interface DeviceInfo {
  readonly devEui: string;
  /** Netzserver-Mandant; beim Betreiber ein Endkunde. Fehlt bei aelteren Fassungen. */
  readonly tenantId?: string;
  /** Netzserver-Application; beim Betreiber ein Gebaeude. */
  readonly applicationId?: string;
}

export interface ChirpStackUplinkEnvelope {
  readonly deviceInfo: DeviceInfo;
  readonly fPort: number;
  /** Base64-kodierte Nutzdaten — vom Ingest-Flow vor dem Decoder-Aufruf dekodiert. */
  readonly data: string;
  /**
   * Von ChirpStack am Geraeteprofil dekodierte Nutzdaten (ADR-0011 D2,
   * Variante a). Fehlt, wenn am Profil kein Codec hinterlegt ist.
   *
   * Bewusst `Record<string, unknown>` und NICHT enger typisiert: Der Inhalt
   * ist je Geraetetyp und fPort verschieden, und was daraus ein Messwert
   * wird, entscheidet allein der jeweilige Decoder. Eine feste Struktur an
   * dieser Stelle waere eine Behauptung ueber fremde Geraete.
   */
  readonly objekt?: Record<string, unknown>;
  readonly time?: string;
  readonly rxInfo?: readonly RxInfoEintrag[];
  readonly fCnt?: number;
}
