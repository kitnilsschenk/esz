import type { StandortStatus, StandortTyp } from '../persistence/energy/energy-standort.repository';
import type { Energietraeger, BetriebsStatus } from '../persistence/energy/energy-zaehler.repository';

/**
 * `components/schemas/StandortStruktur` (schemas/openapi/stammdaten.openapi.yaml,
 * ADR-0010 §5) — PII-FREI (RL-1/D5, `read:standort`-Lesestufe). NIEMALS
 * `bezeichnung`/`anschrift`/`geo`. Einheitliche Projektion für die Baum-Liste
 * UND jede strukturelle Mutation (anlegen/ändern/verschieben/stilllegen) —
 * D5 verlangt strikte Trennung von der PII-Lesestufe, daher trägt AUCH die
 * Create-Antwort (obwohl der Request-Body `bezeichnung` enthielt) keinen
 * Klartext-Label zurück (s. `standort.service.ts`-Klassen-Dok, Design-
 * Entscheidung, kein literales ADR-Zitat).
 */
export interface StandortStruktur {
  readonly id: string;
  readonly endkundeId: string;
  readonly parentId: string | null;
  readonly typ: StandortTyp;
  /** Vorfahrenkette (materialisierter Pfad, D6) — inklusive eigener `id`. */
  readonly pfad: readonly string[];
  readonly ebene: number;
  readonly sortierung: number;
  readonly status: StandortStatus;
  /**
   * Klimastation dieses Standorts (ADR-0010), `null` = keine hinterlegt.
   *
   * Steht in der Antwort, damit das Änderungsformular den aktuellen Wert
   * vorbelegen kann. Ohne das zeigte es ein leeres Feld, und eine Änderung an
   * `typ` oder `sortierung` löschte die Station beiläufig mit.
   */
  readonly klimareferenz: string | null;
  /** Strukturell berechnet (D4-Adressfähigkeit) — s. `standort.constants.ts#hatAdresseStrukturell`. */
  readonly hatAdresse: boolean;
  readonly zaehlerAnzahl: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** `components/schemas/StandortLabelItem` — pii=true, NUR über `read:standort_pii` (D5). */
export interface StandortLabelItem {
  readonly id: string;
  readonly bezeichnung: string;
  readonly anschrift: string | null;
}

/** `components/schemas/StandortPiiDetail` — Echo des gerade geschriebenen Labels (`PUT .../pii`), pii=true. */
export interface StandortPiiDetail {
  readonly id: string;
  readonly bezeichnung: string;
  readonly anschrift: string | null;
  readonly geo: string | null;
}

/**
 * `components/schemas/StandortVerschobenErgebnis` — Reparent-Response inkl.
 * Reichweiten-Nachweis. `parentIdAlt` (der Parent VOR dem Verschieben) dient
 * sowohl der Client-Diff-Anzeige als auch dem Audit-Kontext
 * (`kontext.parent_id_alt`, ADR-0010 D5/V0018).
 */
export interface StandortVerschobenErgebnis {
  readonly standort: StandortStruktur;
  readonly parentIdAlt: string | null;
  readonly nachfahrenAktualisiert: number;
}

/**
 * `components/schemas/StandortStillgelegtErgebnis` — Stilllegen-Response
 * (D2.6). `statusAlt` trägt den Zustand VOR dem Aufruf (`aktiv` bei einer
 * echten Transition, `stillgelegt` bei einem idempotenten Wiederholungsaufruf)
 * — sowohl für die Client-Anzeige als auch den Audit-Kontext
 * (`kontext.status_alt`/`kontext.status_neu`, ADR-0010 D5/V0018).
 */
export interface StandortStillgelegtErgebnis {
  readonly standort: StandortStruktur;
  readonly statusAlt: StandortStatus;
}

/**
 * `components/schemas/StandortLoeschErgebnis` — hartes DELETE (D2.6), kein
 * Struktur-Objekt mehr abrufbar. `endkundeId`/`typ`/`parentIdAlt` (letzter
 * bekannter Zustand VOR der Löschung) dienen dem Audit-Kontext
 * (`kontext.endkunde_id`/`kontext.typ`/`kontext.parent_id_alt`, ADR-0010 D5/V0018).
 */
export interface StandortLoeschErgebnis {
  readonly id: string;
  readonly geloescht: boolean;
  readonly endkundeId: string;
  readonly typ: StandortTyp;
  readonly parentIdAlt: string | null;
}

/** `components/schemas/ZaehlerStandortDetail` (energy.zaehler_standort, PII-frei). */
export interface ZaehlerStandortDetail {
  readonly id: string;
  readonly zaehlerId: string;
  readonly standortId: string;
  readonly gueltigVon: string;
  readonly gueltigBis: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * `components/schemas/StandortPfadEintrag` — EIN Knoten der Breadcrumb-
 * Vorfahrenkette (`GET .../zaehler/{zaehlerId}/verortung`, D6) — PII-FREI
 * (D5, `read:standort`-Lesestufe): NIEMALS `bezeichnung`/`anschrift`. Die
 * Labels holt die UI wie gewohnt über den bestehenden Batch-Endpoint
 * `POST .../standorte/labels` (`read:standort_pii`).
 */
export interface StandortPfadEintrag {
  readonly id: string;
  readonly parentId: string | null;
  readonly typ: StandortTyp;
  readonly ebene: number;
  readonly status: StandortStatus;
}

/**
 * `components/schemas/ZaehlerStandortAktuellDetail` — Antwort von
 * `GET /stammdaten/zaehler/{zaehlerId}/verortung` (UX-Konzept „Wo hängt
 * dieser Zähler?"): die AKTUELL offene Verortung (`gueltig_bis IS NULL`)
 * eines Zählers inklusive Breadcrumb-Pfad (materialisierter Pfad, D6,
 * WURZEL ZUERST). `verortet=false` ist der EMPTY-STATE — sowohl für einen
 * Zähler OHNE jede Verortung als auch für einen Zähler mit AUSSCHLIESSLICH
 * historischen (bereits beendeten) Verortungen — KEIN Fehler, KEIN 404.
 */
export interface ZaehlerStandortAktuellDetail {
  readonly zaehlerId: string;
  readonly verortet: boolean;
  readonly standortId: string | null;
  readonly verortetSeit: string | null;
  /** Vorfahrenkette INKLUSIVE des eigenen Standort-Knotens, WURZEL ZUERST. Leer, wenn `verortet=false`. */
  readonly pfad: readonly StandortPfadEintrag[];
}

/**
 * `components/schemas/ZaehlerUnterKnotenItem` (GET .../standorte/{id}/zaehler,
 * Kern-Query D6) — 1:1-Projektion von `energy.zaehler` (kein `geraeteReferenz`, §12).
 */
export interface ZaehlerUnterKnotenItem {
  readonly id: string;
  readonly systemId: string;
  readonly geraetetyp: string;
  readonly energietraeger: Energietraeger;
  readonly status: BetriebsStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}
