/** Geschlossene Werteliste `energy.endkunde.einschraenkung_grund_code` (V0024, A11-Schema-Delta, C8-Beschluss). */
export const EINSCHRAENKUNG_GRUND_CODES = [
  'art18_1a_richtigkeit',
  'art18_1b_unrechtmaessig',
  'art18_1c_rechtsverteidigung_betroffener',
  'art18_1d_widerspruch',
] as const;
export type EinschraenkungGrundCode = (typeof EINSCHRAENKUNG_GRUND_CODES)[number];

export function isEinschraenkungGrundCode(value: string): value is EinschraenkungGrundCode {
  return (EINSCHRAENKUNG_GRUND_CODES as readonly string[]).includes(value);
}

/** Geteilt von `energy.endkunde`/`energy.anschlussnutzer` (beide V0029-CHECK-gehaertet, identische Wertemenge). */
export type VerarbeitungsStatus = 'aktiv' | 'gesperrt' | 'geloescht';

export interface PaarEinschraenkungEingang {
  readonly verarbeitungsStatus: VerarbeitungsStatus;
  readonly einschraenkungGrundCode: string | null;
}

/**
 * `FJ-07a` | `FJ-07b` | `FJ-07c` (Endkunde) bzw. `FJ-11a` | `FJ-11b` | `FJ-11c`
 * (Anschlussnutzer, ADR-0006 P4/ADR-0007 A12, s. `klassifiziereAnschlussnutzerEinschraenkung()`)
 * — `regelCode=null` bedeutet: KEIN Befund (Subjekt `aktiv`). `grundFehlend=true`
 * markiert den Bestandsdaten-/Struktur-Fall (`gesperrt` ohne dokumentierten
 * Grund) NUR zu forensischen Zwecken (`preflight_befund.kennzahl_klasse`) —
 * er wird trotzdem als `...c`-Code geführt (s. Funktions-Dok), NICHT als
 * eigener vierter Code. `regelCode` ist bewusst `string | null` (nicht ein
 * enges Literal-Union) — der EINE Klassifikations-Algorithmus wird von BEIDEN
 * Subjekt-Arten mit unterschiedlichen Code-Tripeln parametrisiert.
 */
export interface PaarEinschraenkungErgebnis {
  readonly regelCode: string | null;
  readonly schwere: 'hinweis' | 'warnung' | 'blocker' | null;
  /** `true` GENAU DANN, wenn das Paar aus `einsparlauf_ergebnis` als `ausgeschlossen` geführt werden muss (`...c`-Code bzw. der Fail-closed-Bestandsdatenfall). */
  readonly paarAusschluss: boolean;
  readonly grundFehlend: boolean;
}

const KEIN_BEFUND: PaarEinschraenkungErgebnis = {
  regelCode: null,
  schwere: null,
  paarAusschluss: false,
  grundFehlend: false,
};

/** Die drei Regel-Codes eines Dreiteilungs-Satzes (s. `klassifiziereEinschraenkung()`). */
interface EinschraenkungsRegelCodes {
  readonly geloescht: string;
  readonly warnung: string;
  readonly blocker: string;
}

const ENDKUNDE_REGEL_CODES: EinschraenkungsRegelCodes = { geloescht: 'FJ-07a', warnung: 'FJ-07b', blocker: 'FJ-07c' };

/**
 * ADR-0006 P4/ADR-0007 A12 (Backend-Lead-Design-Entscheidung 2026-08-26, KEIN
 * ADR-Literal): Anschlussnutzer-Analogon zu FJ-07a/b/c, unter neuen Codes
 * geführt (FJ-10 ist bereits fuer die A12-Kettenaufloesbarkeit reserviert,
 * s. `KETTE_NICHT_AUFLOESBAR_REGEL_CODE` in `verfahren.const.ts`) — DIESELBE
 * Dreiteilungs-Logik, angewendet auf `energy.anschlussnutzer.
 * verarbeitungs_status` statt `energy.endkunde.verarbeitungs_status`.
 *
 * KORREKTUR (Review 2026-08-26): eine frühere Fassung dieses Kommentars
 * behauptete, `energy.anschlussnutzer` trage KEINE
 * `einschraenkung_grund_code`-Spalte, und der Aufrufer übergebe deshalb immer
 * `null`. **Das war falsch** — V0024 hat die A11-Felder
 * (`einschraenkung_grund_code`, `gesperrt_seit`) an `energy.anschlussnutzer`
 * GENAUSO ergänzt wie an `energy.endkunde` (verifiziert gegen die Dev-DB).
 * Beide Aufrufstellen reichen den Grund seither durch.
 *
 * Warum das nicht bloß Kosmetik war: ohne Grund landete JEDER gesperrte
 * Anschlussnutzer im Fail-closed-Zweig `FJ-11c` (Paar-Ausschluss) — auch der
 * Fall „Richtigkeit bestritten" (Art. 18(1)(a)), für den ADR-0007 C4
 * ausdrücklich den AUSWEIS MIT KENNZEICHNUNG vorsieht. Die Wirkung war zwar
 * sicher (fail-closed), aber unnötig streng und verkürzte die
 * DE-02-Vollständigkeit genau dort, wo die Dreiteilung sie erhalten soll.
 *
 * Der Fail-closed-Zweig greift weiterhin, wenn ein `gesperrt`-Datensatz
 * KEINEN Grund trägt (Bestandsdaten — der A11-CHECK erzwingt den Grund
 * bewusst nur in der Vorwärtsrichtung, s. V0024).
 */
const ANSCHLUSSNUTZER_REGEL_CODES: EinschraenkungsRegelCodes = { geloescht: 'FJ-11a', warnung: 'FJ-11b', blocker: 'FJ-11c' };

/**
 * ADR-0007 Teil C, Auflage A11 + C4 (Entscheidung zu O-B6) — die KRITISCHE
 * Regel dieses Moduls: Art.-18-Sperren sind ein PAAR-Ausschluss, NIEMALS ein
 * Förderjahr-Blocker (C2: „Eine Kontrolle, die zu ihrer eigenen Umgehung
 * drängt, ist keine.").
 *
 * - `verarbeitungsStatus === 'geloescht'` (Art. 17 vollzogen) → `codes.geloescht`,
 *   `hinweis`, KEIN Ausschluss — die Zeile wird REGULÄR ausgewiesen (A11
 *   wörtlich: „ist KEIN Befund, sondern regulär auszuweisen"; hier dennoch
 *   als `hinweis` protokolliert statt komplett stumm, s. Design-Entscheidung
 *   in der finalen Antwort — DE-02-Nachvollziehbarkeit, kein Effekt auf
 *   `blocker_anzahl`/`ergebnis`).
 * - `verarbeitungsStatus === 'gesperrt'`:
 *   - Grund `art18_1a_richtigkeit`/`art18_1c_rechtsverteidigung_betroffener`
 *     → `codes.warnung`, KEIN Ausschluss (Ausweis MIT Kennzeichnung).
 *   - Grund `art18_1b_unrechtmaessig`/`art18_1d_widerspruch` → `codes.blocker`
 *     (PAAR-scoped — s. `PreflightService`-Kommentar zur `blocker_anzahl`-
 *     Berechnung: `...c`-Befunde zählen NICHT in den Förderjahr-Gate),
 *     Ausschluss.
 *   - Grund `null`/unbekannt (Bestandsdaten bzw. — beim Anschlussnutzer —
 *     der STRUKTURELLE Regelfall mangels Grund-Spalte) → FAIL-CLOSED wie
 *     `codes.blocker` behandelt (Design-Entscheidung, s. finale Antwort: ohne
 *     Grund ist eine Übermittlung nicht rechtssicher einzuordnen — Art. 18(2)
 *     trägt die Übermittlung nur für die BEKANNTEN vier Tatbestände, ein
 *     unbekannter Grund kann nicht als „harmloser" 1a/1c-Fall unterstellt
 *     werden; die sicherere, DSGVO-konformere Annahme ist der Ausschluss,
 *     nicht der Ausweis). `grundFehlend=true` markiert diesen Unterfall
 *     zusätzlich.
 * - `verarbeitungsStatus === 'aktiv'` → kein Befund.
 */
function klassifiziereEinschraenkung(eingang: PaarEinschraenkungEingang, codes: EinschraenkungsRegelCodes): PaarEinschraenkungErgebnis {
  if (eingang.verarbeitungsStatus === 'geloescht') {
    return { regelCode: codes.geloescht, schwere: 'hinweis', paarAusschluss: false, grundFehlend: false };
  }

  if (eingang.verarbeitungsStatus === 'aktiv') {
    return KEIN_BEFUND;
  }

  // verarbeitungsStatus === 'gesperrt'
  const grund = eingang.einschraenkungGrundCode;
  if (grund === 'art18_1a_richtigkeit' || grund === 'art18_1c_rechtsverteidigung_betroffener') {
    return { regelCode: codes.warnung, schwere: 'warnung', paarAusschluss: false, grundFehlend: false };
  }
  if (grund === 'art18_1b_unrechtmaessig' || grund === 'art18_1d_widerspruch') {
    return { regelCode: codes.blocker, schwere: 'blocker', paarAusschluss: true, grundFehlend: false };
  }

  // Bestandsdaten-/Struktur-Fail-closed: gesperrt, aber Grund fehlt/unbekannt.
  return { regelCode: codes.blocker, schwere: 'blocker', paarAusschluss: true, grundFehlend: true };
}

/** `energy.endkunde.verarbeitungs_status`/`einschraenkung_grund_code` — FJ-07a/b/c (Auflage A11). */
export function klassifiziereEndkundeEinschraenkung(eingang: PaarEinschraenkungEingang): PaarEinschraenkungErgebnis {
  return klassifiziereEinschraenkung(eingang, ENDKUNDE_REGEL_CODES);
}

/**
 * `energy.anschlussnutzer.verarbeitungs_status` — FJ-11a/b/c (ADR-0006 P4,
 * ADR-0007 A12, backend-lead-Design-Entscheidung 2026-08-26, s. Konstanten-Dok
 * oben). Aufrufer lösen den Anschlussnutzer VORHER über die Kette
 * `analytics.berechnungslauf.mvet_id` → `energy.messkonzept_version_
 * energietraeger_system` → `system_id` → `energy.nutzungsverhaeltnis` →
 * `anschlussnutzer_id` auf (`AnalyticsLaufLookupRepository.
 * findAnschlussnutzerSperrenFuerPaar()`, seit V0028 möglich) — diese Funktion
 * selbst kennt die Kette NICHT, sie klassifiziert nur EIN bereits
 * aufgelöstes `(verarbeitungsStatus, einschraenkungGrundCode)`-Paar.
 */
export function klassifiziereAnschlussnutzerEinschraenkung(eingang: PaarEinschraenkungEingang): PaarEinschraenkungErgebnis {
  return klassifiziereEinschraenkung(eingang, ANSCHLUSSNUTZER_REGEL_CODES);
}
