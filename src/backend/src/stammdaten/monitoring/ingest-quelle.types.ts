import type { QuelleStatus, TlsModus } from '../persistence/ingest/ingest-quelle.repository';

export type { QuelleStatus, TlsModus };

/** Die Felder, in denen ein Geheimnis stehen kann — Namen, nie Werte. */
export const GEHEIMNIS_FELDER = [
  'benutzername',
  'passwort',
  'ca_zertifikat',
  'client_zertifikat',
  'client_schluessel',
] as const;

export type GeheimnisFeld = (typeof GEHEIMNIS_FELDER)[number];

/**
 * `GET /monitoring/ingest/quellen` — die Konfiguration einer Datenquelle,
 * WIE SIE DIE API AUSGIBT.
 *
 * **Was hier fehlt, fehlt mit Absicht.** Kein Benutzername, kein Passwort,
 * kein Zertifikat und kein privater Schlüssel — auch nicht gekürzt, maskiert
 * oder gehasht. Ein maskierter Wert („ab••••yz") verrät Länge und Ränder, ein
 * Hash wäre ein Orakel für schwache Passwörter, und beides lädt dazu ein,
 * später doch den Klartext „nur zum Prüfen" nachzureichen.
 *
 * Stattdessen sagt `hinterlegteGeheimnisse`, WELCHE Felder belegt sind. Das
 * ist die Auskunft, die der Betrieb braucht („habe ich das Zertifikat schon
 * eingespielt?"), und die einzige, die er ohne Risiko bekommen kann.
 */
export interface IngestQuelleItem {
  readonly id: string;
  readonly quelleCode: string;
  readonly bezeichnung: string;
  readonly brokerHost: string;
  readonly topic: string;
  readonly clientId: string;
  readonly tlsModus: TlsModus;
  readonly status: QuelleStatus;
  readonly notiz: string | null;
  /** Feldnamen der hinterlegten Geheimnisse — niemals deren Werte. */
  readonly hinterlegteGeheimnisse: readonly GeheimnisFeld[];
  /**
   * `notAfter` der hinterlegten Zertifikate; `null` = keines hinterlegt.
   *
   * Das Ablaufdatum ist KEIN Geheimnis — es steht im öffentlichen Teil des
   * Zertifikats, und jeder, der die Verbindung sieht, kennt es. Es wird
   * ausgegeben, weil ein ablaufendes Client-Zertifikat die Datenaufnahme
   * stilllegt, und zwar lautlos: Der Broker verweigert die Verbindung, der
   * Worker kommt nicht durch, und niemand erfährt davon, bis jemand fehlende
   * Messwerte bemerkt.
   */
  readonly caZertifikatGueltigBis: string | null;
  readonly clientZertifikatGueltigBis: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
