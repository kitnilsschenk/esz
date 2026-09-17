/** Subjektarten, die einwilligen können (ADR-0012 E6, DS-07). */
export const SUBJEKT_TYPEN = ['endkunde', 'anschlussnutzer'] as const;
export type SubjektTyp = (typeof SUBJEKT_TYPEN)[number];

/**
 * Rechtsgrundlage einer Einwilligung. ADR-0012 O1 ist NICHT entschieden —
 * ob die Kernverarbeitung auf Einwilligung (Art. 6 Abs. 1 lit. a) oder auf
 * Vertragserfüllung (lit. b) gestützt wird, ist eine Rechtsfrage. Deshalb
 * beide Werte, KEIN Default.
 */
export const RECHTSGRUNDLAGEN = ['einwilligung_art6_1a', 'vertrag_art6_1b'] as const;
export type Rechtsgrundlage = (typeof RECHTSGRUNDLAGEN)[number];

/**
 * Wege, auf denen eine Einwilligung ins System kommt (V0044).
 *
 * `digital_opt_in` ist über die Betriebs-API **nicht** erfassbar — s.
 * `EinwilligungService`. Der Wert existiert für das spätere Nutzerportal,
 * in dem die betroffene Person selbst handelt.
 */
export const ERFASSUNGSWEGE = ['digital_opt_in', 'vertrag_schriftlich', 'uebernahme_altbestand'] as const;
export type Erfassungsweg = (typeof ERFASSUNGSWEGE)[number];

/** Erlaubnismodus je (Zweck, Subjektart) — A12-6. */
export const ERLAUBNISMODI = ['opt_in', 'opt_out', 'vertraglich'] as const;
export type Erlaubnismodus = (typeof ERLAUBNISMODI)[number];

export interface ZweckItem {
  readonly code: string;
  readonly bezeichnung: string;
  readonly beschreibung: string;
}

/**
 * Die Rechtsgrundlagen-Matrix (V0047, `compliance-director`-Votum zu
 * ADR-0012 O1).
 *
 * Sie beantwortet je (Zweck, Subjektart) drei Fragen, die zusammengehören:
 * WORAUF sich die Verarbeitung stützt, WIE die Erlaubnis zustande kommt und
 * OB eine Verweigerung die Leistung kostet.
 *
 * `verweigerbar` steht hier und nicht mehr am Zweck: Als eine Spalte am
 * Zweck war die Angabe für die Hälfte der Betroffenen unrichtig —
 * `messdaten_verarbeitung` ist für den Endkunden nicht verweigerbar
 * (Vertragsgegenstand) und für den Anschlussnutzer sehr wohl (er verliert
 * nichts).
 */
export interface ZweckSubjektRegel {
  readonly zweckCode: string;
  readonly subjektTyp: SubjektTyp;
  readonly rechtsgrundlage: Rechtsgrundlage;
  readonly erlaubnismodus: Erlaubnismodus;
  readonly verweigerbar: boolean;
  /** Warum genau diese Grundlage gilt — wird dem Bediener angezeigt. */
  readonly begruendung: string;
}

export interface TextVersionItem {
  readonly id: string;
  readonly zweckCode: string;
  readonly fassung: string;
  readonly wortlaut: string;
  /** SHA-256 des Wortlauts, hex — macht eine nachträgliche Textänderung sichtbar. */
  readonly wortlautSha256: string;
  readonly gueltigAb: string;
  readonly gueltigBis: string | null;
}

/** Art des belegten Vorgangs (V0046, A12-29). */
export const BELEG_ARTEN = ['erteilung', 'widerruf'] as const;
export type BelegArt = (typeof BELEG_ARTEN)[number];

/**
 * Eine Einwilligung, wie die API sie ausgibt.
 *
 * PII-FREI: Kennungen, Codes, Zeitpunkte. Die IP und der User-Agent stehen
 * feldverschlüsselt im Beleg (`identity.einwilligung_beleg`) und verlassen
 * ihn nicht über diese Schnittstelle.
 */
export interface EinwilligungItem {
  readonly id: string;
  readonly subjektTyp: SubjektTyp;
  readonly subjektId: string;
  readonly zweckCode: string;
  readonly textVersionId: string;
  readonly fassung: string;
  readonly rechtsgrundlage: Rechtsgrundlage;
  readonly erfassungsweg: Erfassungsweg;
  /** Fundstelle des zugrundeliegenden Dokuments (A12-28); `null` nur beim digitalen Weg. */
  readonly quelleRef: string | null;
  /**
   * Zeitpunkt der ERKLAERUNG durch die betroffene Person — nicht der
   * Zeitpunkt der Erfassung (A12-27). Bei nachgetragenen Vorgaengen liegen
   * beide Wochen auseinander.
   */
  readonly erteiltAt: string;
  /** Zeitpunkt, zu dem der Widerruf ERKLAERT wurde. */
  readonly widerrufenAt: string | null;
  readonly widerrufErfassungsweg: Erfassungsweg | null;
  readonly widerrufQuelleRef: string | null;
  /** Abgeleitet: `widerrufenAt === null`. Der Zustand folgt aus dem Ereignis, nicht umgekehrt. */
  readonly wirksam: boolean;
}

/**
 * Auflage C-10 — was ein Widerruf TATSAECHLICH bewirkt, gemessen am
 * Ingest-Gate.
 *
 * Zwei Zahlen, weil eine allein mehrdeutig ist: `zaehlerGestoppt === 0` kann
 * heissen „der Widerruf aenderte nichts, weil eine andere Grundlage traegt"
 * oder „er aenderte nichts, weil ohnehin schon alles stand". Erst
 * `zaehlerOhneGrundlage` trennt die Faelle — und beantwortet der betroffenen
 * Person die Frage, die sie mit dem Widerruf eigentlich stellt: hoert die
 * Messung jetzt auf?
 *
 * Solange das Gate nicht scharf geschaltet ist, beschreiben die Zahlen die
 * Wirkung, die der Widerruf HAETTE. Das ist keine Schoenfaerberei, sondern
 * die einzige ehrliche Aussage in diesem Zustand — und zugleich die beste
 * verfuegbare Auskunft darueber, was die Scharfschaltung veraendern wuerde.
 */
export interface WiderrufWirkung {
  /**
   * Zaehler, deren Rechtsgrundlage GENAU DIESER Widerruf beendet hat
   * (Differenz der Gate-Auswertung vor und nach dem UPDATE).
   */
  readonly zaehlerGestoppt: number;
  /** Zaehler des Subjekts, die danach INSGESAMT ohne Rechtsgrundlage sind. */
  readonly zaehlerOhneGrundlage: number;
}

/**
 * Das Ergebnis eines Widerrufs: die Einwilligung in ihrem neuen Zustand plus
 * die gemessene Wirkung.
 *
 * `wirkung` ist `null`, wenn die Messung nicht moeglich war (fehlendes
 * EXECUTE-Recht auf dem Gate, s. `EinwilligungService.widerrufe()`). Der
 * Widerruf selbst gilt dann trotzdem — die Ausuebung eines Betroffenenrechts
 * darf nicht daran scheitern, dass die Berichterstattung darueber klemmt.
 */
export interface EinwilligungWiderrufItem extends EinwilligungItem {
  readonly wirkung: WiderrufWirkung | null;
}

/**
 * Der Stand eines Subjekts über ALLE Zwecke — die Ansicht, die eine
 * Auskunft nach Art. 15 DSGVO beantwortet.
 *
 * Enthält bewusst auch Zwecke OHNE Einwilligung (`einwilligung: null`).
 * Nur so ist „hierzu wurde nie eingewilligt" von „hierzu gibt es keinen
 * Zweck" unterscheidbar — eine Liste, die nur Erteiltes zeigt, beantwortet
 * die Frage nach dem Nicht-Erteilten nicht.
 */
export interface SubjektConsentStand {
  readonly subjektTyp: SubjektTyp;
  readonly subjektId: string;
  readonly zwecke: readonly SubjektZweckStand[];
}

export interface SubjektZweckStand {
  readonly zweckCode: string;
  readonly bezeichnung: string;
  readonly verweigerbar: boolean;
  /** Aus der Matrix bestimmt (A12-1) — NICHT vom Aufrufer gewählt. */
  readonly rechtsgrundlage: Rechtsgrundlage;
  readonly erlaubnismodus: Erlaubnismodus;
  readonly begruendung: string;
  /** Die derzeit wirksame Einwilligung, oder `null`. */
  readonly wirksameEinwilligung: EinwilligungItem | null;
  /** Vollständiger Verlauf, neueste zuerst — der Nachweis nach Art. 7 Abs. 1. */
  readonly verlauf: readonly EinwilligungItem[];
}

/**
 * Ein Widerspruch, wie die API ihn ausgibt (V0052, Auflage AW-27).
 *
 * Gegenstuck zur Einwilligung — fuer die andere Haelfte der Matrix. Wo eine
 * Verarbeitung OHNE Einwilligung laeuft (`opt_out` oder `vertraglich`), gibt
 * es nichts zu widerrufen; dort erklaert die betroffene Person einen
 * Widerspruch bzw. waehlt die Leistung ab.
 *
 * **Die Unterscheidung ist keine Wortklauberei.** Ein Widerruf nach Art. 7
 * Abs. 3 entzieht einer Einwilligung die Grundlage; ein Widerspruch richtet
 * sich gegen eine Verarbeitung, die auch ohne Zustimmung zulaessig war. Sie
 * in dieselbe Zeile zu legen hiesse, dem Betroffenen mal ein Recht
 * zuzuschreiben, das er nicht hat, und mal eines zu verschweigen, das er hat.
 *
 * PII-FREI: Kennungen, Codes, Zeitpunkte. `quelleRef` ist die Fundstelle des
 * zugrundeliegenden Dokuments und kann einen Namen enthalten — sie steht
 * deshalb hier, aber NICHT im Audit-Kontext (V0053).
 */
export interface WiderspruchItem {
  readonly id: string;
  readonly subjektTyp: SubjektTyp;
  readonly subjektId: string;
  readonly zweckCode: string;
  readonly erlaubnismodus: Erlaubnismodus;
  /** Zeitpunkt der ERKLAERUNG, nicht der Erfassung. */
  readonly erklaertAt: string;
  readonly erfassungsweg: Erfassungsweg;
  readonly quelleRef: string | null;
  readonly zurueckgenommenAt: string | null;
  readonly ruecknahmeErfassungsweg: Erfassungsweg | null;
  readonly ruecknahmeQuelleRef: string | null;
  /** Abgeleitet: `zurueckgenommenAt === null`. */
  readonly wirksam: boolean;
}
