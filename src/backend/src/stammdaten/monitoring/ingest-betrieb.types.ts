import type {
  IngestGrundAnzahl,
  IngestQuarantaeneGrund,
  IngestVerwurfTag,
} from '../persistence/ingest/ingest-betrieb.repository';

export type { IngestQuarantaeneGrund, IngestGrundAnzahl, IngestVerwurfTag };

/**
 * Zustand EINER Netzserver-Quelle (ADR-0011 O8/D8).
 *
 * `lebendig` ist die einzige Angabe, auf die man sich verlassen sollte: Sie
 * verlangt BEIDES — der Worker meldet eine stehende Verbindung UND sein
 * Herzschlag ist frisch. `verbunden` allein wäre eine Falschaussage, sobald
 * der Prozess abstürzt: Er kann das Flag dann nicht mehr zurücksetzen, und
 * die Zeile bliebe für immer grün.
 */
export interface IngestQuelle {
  readonly quelleCode: string;
  /** Host[:Port] — ohne Zugangsdaten (V0039). */
  readonly brokerHost: string;
  readonly topic: string;
  readonly clientId: string;
  readonly verbunden: boolean;
  /** `verbunden` UND frischer Herzschlag — s. Schnittstellen-Dok. */
  readonly lebendig: boolean;
  readonly letzteVerbindungAt: string | null;
  readonly letzterHerzschlagAt: string;
  /**
   * Ob es zu dieser Kennung eine gepflegte Quelle gibt (`ingest.quelle`).
   *
   * `false` heißt: Hier läuft ein Worker, dessen Konfiguration niemand in der
   * Plattform gepflegt hat — er zieht sie aus Umgebungsvariablen. Das ist
   * zulässig (Verhalten vor V0059), aber es soll sichtbar sein.
   */
  readonly gepflegt: boolean;
  /**
   * Die gepflegte Quelle steht auf `inaktiv`, der Prozess läuft aber noch.
   *
   * Das ist kein Widerspruch, sondern der Normalfall direkt nach dem
   * Deaktivieren: Ein laufender Worker liest seine Konfiguration nicht neu.
   * Beim nächsten Start bleibt er stehen (fail-closed).
   */
  readonly gepflegtInaktiv: boolean;
  /**
   * Felder, in denen der LAUFENDE Prozess von der gepflegten Konfiguration
   * abweicht.
   *
   * Der Worker lädt seine Quelle nur beim Start. Wird sie danach geändert,
   * fährt er mit der alten weiter — und die Oberfläche zeigte die gepflegten
   * Werte, während er andere benutzt. Genau dann sagt sie das Gegenteil von
   * dem, wofür man sie aufruft. Diese Liste macht die Abweichung sichtbar,
   * statt sie zu glätten.
   */
  readonly abweichendeFelder: readonly string[];
}

/**
 * Betriebszustand der Messdaten-Aufnahme, AUS DER DATENBANK abgeleitet
 * (ADR-0011 A2).
 *
 * Die Zeitpunkte und Quarantäne-Zahlen sind weiterhin ÜBER ALLE QUELLEN
 * zusammengefasst; der Zustand je Quelle steht in `quellen`. Beides
 * zusammen ist nötig: Die Summe beantwortet „kommt überhaupt etwas an?", die
 * Aufschlüsselung „von welchem Netz nicht mehr?".
 */
export interface IngestStatus {
  /** Eine Zeile je Netzserver, die sich je gemeldet hat. Leer = noch nie ein Worker gelaufen. */
  readonly quellen: readonly IngestQuelle[];
  readonly letzterMesswertAt: string | null;
  readonly letzteSchreibungAt: string | null;
  readonly letzteQuarantaeneAt: string | null;
  readonly quarantaeneGesamt: string;
  readonly quarantaeneJeGrund: readonly IngestGrundAnzahl[];
  /**
   * Auflage C-6 — verworfene Uplinks je Tag und Grund (V0085), die letzten
   * `VERWURF_FENSTER_TAGE` Tage.
   *
   * Warum das HIER steht und nicht in einem eigenen Bericht: Ein Verwurf
   * mangels Rechtsgrundlage hinterlaesst KEINE Quarantaene-Zeile (A12-13) —
   * die Betriebssicht auf die Aufnahme haette sonst eine Luecke genau dort,
   * wo Daten verschwinden. Wer fragt "kommt etwas an, und was bleibt
   * liegen?", muss auch "und was wurde weggeworfen?" beantwortet bekommen,
   * sonst beantwortet die Sicht die Frage nur halb.
   */
  readonly verwurfTage: readonly IngestVerwurfTag[];
  /** Summe ueber das Fenster — die eine Zahl, an der ein Ausfall sichtbar wird. */
  readonly verwurfSumme: string;
}

/** Eine liegengebliebene Nachricht — OHNE Blind-Index, Hash und Rohpayload. */
export interface IngestQuarantaeneItem {
  readonly id: string;
  readonly grund: IngestQuarantaeneGrund;
  readonly zaehlerId: string | null;
  readonly messkanalKey: number | null;
  readonly fPort: number | null;
  /** Welcher Worker die Nachricht empfangen hat; `null` bei Zeilen von vor V0041. */
  readonly quelleCode: string | null;
  /** Opake Netzserver-Kennungen — NUR IDs, keine Namen (ADR-0011 D1). */
  readonly chirpstackTenantId: string | null;
  readonly chirpstackApplicationId: string | null;
  readonly topicRedacted: string;
  readonly empfangenAt: string;
  /**
   * Die Messgrößen, die der betroffene Zähler tatsächlich führt, als
   * `messgroesse (einheit)`-Liste — `null`, wenn kein Zähler aufgelöst werden
   * konnte oder er keine Kanäle hat.
   *
   * Sie steht hier, weil der Kanal-Lookup der Aufnahme `messgroesse` EXAKT
   * vergleicht. Weicht die Schreibweise am Zähler von dem ab, was der Decoder
   * liefert, landet jeder Uplink als `kanal_unbekannt` in Quarantäne — und
   * ohne diese Liste war die Ursache nur zu finden, indem man die Nutzlast von
   * Hand dekodierte und gegen die Stammdaten hielt.
   */
  readonly zaehlerMessgroessen: string | null;
}
