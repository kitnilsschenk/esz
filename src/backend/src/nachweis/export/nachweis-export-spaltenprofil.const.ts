/**
 * ADR-0007 D5/D6 + Teil C Auflage A15 („Spalten-Positivliste per Migration")
 * + O-B8 (CSV-Konvention/Spaltenprofil je Kategorie — Empfängerseite
 * BAFA/BSCW, `bafa-export-engineer` + User, laut ADR-0007 B12/C7 NOCH OFFEN).
 *
 * **Laufzeit-Realität (ehrlich benannt, KEINE stillschweigende Annahme):**
 * `migrations/V0024__nachweis_vorbedingungen_a11_und_verfahrenskatalog.sql`
 * legt für `analytics.verfahren_version` (code=`nachweis_export_kanonisch`,
 * art=`exportschema`) das Feld `parameter_schema.spaltenprofil` BEWUSST auf
 * `null` fest — wörtlich: „Das spaltenscharfe Positivlisten-Profil je Datei
 * ... hängt an der noch offenen CSV-Konvention O-B8 ... Diese Migration
 * ERFINDET dieses Spaltenprofil NICHT — eine Nachtragsmigration (neue
 * Nummer) liefert es, sobald O-B8 beantwortet ist." Dieser Arbeitsauftrag
 * verbietet ausdrücklich neue Migrationen — die folgende Konstante ist daher
 * der **v1-Vorschlag für O-B8/A15 in Code-Form**, exakt nach dem bereits
 * etablierten Studio-Muster „TS-Konstante spiegelt/antizipiert den
 * Katalog-Wert, `parameter_schema` wird nicht dynamisch geparst"
 * (`nachweis/verfahren.const.ts`s `ABDECKUNGSFLOOR_PCT_DEFAULT`-Kommentar,
 * analog `ADR-0006 witterung-gtz.ts`). **BESTÄTIGUNGSBEDÜRFTIG** — s. finale
 * Antwort dieses Arbeitspakets. Sobald O-B8 beantwortet ist, gehört dieses
 * Profil per Nachtragsmigration NEBEN diese Konstante in
 * `analytics.verfahren_version.parameter_schema.spaltenprofil` (append-only,
 * neue `version`, nicht diese Datei ändern — Muster `export_schema_version`,
 * D5).
 *
 * Der Renderer (`nachweis-export-renderer.ts`) schreibt AUSSCHLIESSLICH
 * Spalten aus DIESER Datei — kein `SELECT *`, keine durchgereichten
 * Zusatzfelder (D6/A15).
 */

/** Entspricht `nachweis.export.schema_code`/`analytics.verfahren.code` (V0024). */
export const EXPORT_SCHEMA_CODE = 'nachweis_export_kanonisch';
/** Entspricht `nachweis.export.schema_version`/`analytics.verfahren_version.version` (V0024). Seit V0064 nicht mehr die aktive Version — Altexporte rendern weiter darunter. */
export const EXPORT_SCHEMA_VERSION_V1 = 1;

/**
 * Dateinamen — MÜSSEN wortgleich den `V0025`-CHECK
 * `ck_export_datei_kategorie_dateiname`-Regex treffen, sonst schlägt das
 * `INSERT` fehl (DB-Backstop, A19). Erweiterung `.csv` fest (kein XLSX in
 * diesem Paket, s. Datei-Kopf `csv.util.ts`).
 */
export const EXPORT_DATEINAMEN = {
  ROHDATEN_MESSWERT_TAG: 'rohdaten_messwert_tag.csv',
  BASELINE_LAUF: 'baseline_lauf.csv',
  BASELINE_KLIMA_TAG: 'baseline_klima_tag.csv',
  EINFLUSSGROESSEN_INTERVALL: 'einflussgroessen_intervall.csv',
  EINSPARDATEN_MONAT: 'einspardaten_monat.csv',
  EINSPARDATEN_JAHR: 'einspardaten_jahr.csv',
  EINSPARDATEN_DIFFERENZ: 'einspardaten_differenz.csv',
  GERAETEERKENNUNG_QUOTE: 'geraeteerkennung_quote.csv',
  GERAETEERKENNUNG_GRUPPE: 'geraeteerkennung_gruppe.csv',
  /**
   * Exportschema v3 (V0075) — die EINZIGE Datei des Buendels, die
   * ausschliesslich `.xlsx` ist. Sie IST das behoerdliche Formular; ein
   * CSV-Abzug davon waere weder das Formular noch eine Tabelle.
   */
  EINSPARUNGSNACHWEIS: 'einsparungsnachweis.xlsx',
  METABLATT: 'metablatt.csv',
  MANIFEST: 'manifest.csv',
} as const;

export type ExportKategorie =
  | 'rohdaten'
  | 'baseline'
  | 'einflussgroessen'
  | 'einspardaten'
  /** Seit Exportschema v2 (V0064) — TB-05-Quotennachweis. */
  | 'geraeteerkennung'
  /** Seit Exportschema v3 (V0075) — die Nachweis-Mappe in der Form der BAFA-Vorlage. */
  | 'einsparungsnachweis'
  | 'meta';

/**
 * Exportschema v2 (V0064) — identisch zu v1, ergaenzt um die zwei
 * Geraeteerkennungs-Dateien.
 *
 * v1 bleibt bestehen und wird NICHT veraendert: Der Download rendert einen
 * bestehenden Export NEU und vergleicht gegen seinen Hash. Zwei zusaetzliche
 * Dateien im v1-Rendering liessen jeden bereits eingereichten Nachweis
 * rueckwirkend als gedriftet erscheinen.
 */
export const EXPORT_SCHEMA_VERSION_V2 = 2;

/**
 * Exportschema v3 (V0075) — identisch zu v2, ergaenzt um
 * `einsparungsnachweis.xlsx`: denselben Zahlenbestand in der Gliederung des
 * behoerdlichen Formulars statt der des Datenkatalogs.
 *
 * v2 bleibt unveraendert, aus demselben Grund wie v1 bei V0064: Der Download
 * rendert bestehende Exporte NEU und prueft gegen ihren Hash.
 */
export const EXPORT_SCHEMA_VERSION_V3 = 3;

/**
 * Exportschema v4 (V0077) — identisch zu v3 im Dateisatz und in allen CSVs;
 * geaendert hat sich ausschliesslich der INHALT von
 * `einsparungsnachweis.xlsx`, Blatt 4: Spalte „Modelltyp" nennt jetzt den Weg
 * zu den Koeffizienten, Spalte „Modellguete R²" traegt bei angepasstem Modell
 * die Zahl (V0076), und darunter steht eine Guetetabelle.
 *
 * ABWEICHUNG VOM MUSTER DER VORGAENGERVERSIONEN: v3 und v4 teilen sich den
 * Renderer. v3 entstand am selben Tag wie v4, existiert nur im
 * Entwicklungsbestand und wurde nie eingereicht — den alten Mappen-Code als
 * Altlast mitzuschleppen waere Aufwand ohne Nutzen. Ein unter v3 erzeugter
 * Export meldet beim Download folglich eine Hash-Abweichung: die
 * Drift-Sicherung schlaegt korrekt an (das Rendering HAT sich geaendert) und
 * der Export ist neu zu erzeugen. Bei einem je EINGEREICHTEN Export waere
 * diese Abkuerzung unzulaessig.
 */
export const EXPORT_SCHEMA_VERSION_V4 = 4;

/**
 * Exportschema v5 (V0078) — die Mappe an die BAFA-Vorlage angeglichen:
 * Energieträger in der Schreibweise des Formulars, Blatt 5 B/C/D und G
 * wörtlich als Vorlagenformeln, Blatt 6b ohne blattübergreifenden
 * Kriterienbereich. Dateisatz und CSVs unverändert.
 *
 * Teilt sich den Renderer mit v3 und v4 aus demselben Grund wie dort: keine
 * der Vorversionen wurde je eingereicht.
 */
export const EXPORT_SCHEMA_VERSION_V5 = 5;

/** Spalten-Positivlisten je Datei (O-B8/A15-Vorschlag, s. Datei-Kopf). Reihenfolge = Spaltenreihenfolge im CSV (Determinismus). */
export const EXPORT_SPALTENPROFIL = {
  /**
   * TB-05 ([Q3] Kap. 5): „X % des Jahresverbrauchs zuordenbar". Eine Zeile je
   * (Endkunde, Energietraeger) — die Frage „wird die Quote erreicht?".
   *
   * `quote_pct` und `erreicht` sind LEER, wenn es fuer den Zeitraum keine
   * Tageswerte gibt. Eine Quote ohne Nenner ist keine 0: Eine 0 sieht aus wie
   * ein Ergebnis und wird als eines gelesen.
   */
  [EXPORT_DATEINAMEN.GERAETEERKENNUNG_QUOTE]: [
    'endkunde_pseudonym',
    'energietraeger',
    'foerderjahr_code',
    'foerderjahr_nummer',
    'von_monat',
    'bis_monat',
    'gesamt_kwh',
    'zugeordnet_kwh',
    'quote_pct',
    'soll_quote_pct',
    'erreicht',
    'systeme_gesamt',
    'systeme_entbehrlich',
    'ohne_tageswerte',
  ],
  /**
   * Die „Zuordnungs-Metadaten je Verbrauchsanteil" derselben Auflage — eine
   * Zeile je (Endkunde, Energietraeger, Gruppe, METHODE). Die Methode ist
   * Teil der Gruppierung, weil eine gemessene Zuordnung etwas anderes ist als
   * eine gerechnete und eine Zeile je Gruppe sich fuer eine der beiden
   * entscheiden muesste.
   *
   * `geraetegruppe` traegt im Regelfall das Pseudonym `GG-<lfd>`; die
   * Freitext-Bezeichnung erscheint NUR bei `station_darstellung='klarname'`
   * (Auflage A13, aktenkundige Anfrage). KEIN Messkanal — der haengt an der
   * A12-Rohdaten-Freigabe, die Quote nicht.
   */
  [EXPORT_DATEINAMEN.GERAETEERKENNUNG_GRUPPE]: [
    'endkunde_pseudonym',
    'energietraeger',
    'geraetegruppe',
    'methode',
    'zugeordnet_kwh',
    'anteil_pct',
    'genauigkeit_pct_min',
  ],
  [EXPORT_DATEINAMEN.ROHDATEN_MESSWERT_TAG]: [
    'endkunde_pseudonym',
    'energietraeger',
    'messkanal_pseudonym',
    'tag',
    'wert_kwh',
    'qualitaet_min',
    'anzahl_messwerte',
  ],
  [EXPORT_DATEINAMEN.BASELINE_LAUF]: [
    'endkunde_pseudonym',
    'energietraeger',
    'berechnungslauf_id',
    'periode_von',
    'periode_bis',
    'station',
    'verfahren_code',
    'verfahren_version',
    'parameter_json',
    'parameter_hash_hex',
    'rohdaten_hash_hex',
    'baseline_wert_kwh',
    'grundlast_anteil',
    'gtz_base',
    'gtz_norm',
    'baseline_norm_kwh',
    'qualitaets_stufe_min',
  ],
  [EXPORT_DATEINAMEN.BASELINE_KLIMA_TAG]: ['station', 'tag', 't_mittel', 'gtz_tag'],
  [EXPORT_DATEINAMEN.EINFLUSSGROESSEN_INTERVALL]: [
    'endkunde_pseudonym',
    'system_pseudonym',
    'groesse_code',
    'wert_klassiert',
    'gueltig_ab_monat',
    'gueltig_bis_monat',
  ],
  [EXPORT_DATEINAMEN.EINSPARDATEN_MONAT]: [
    'endkunde_pseudonym',
    'energietraeger',
    'monat',
    'berechnungslauf_id',
    'referenz_kwh',
    'ist_kwh',
    'delta_kwh',
    'delta_ausgewiesen_kwh',
    'qualitaets_stufe',
    'behandlung',
    'kandidaten_anzahl',
  ],
  [EXPORT_DATEINAMEN.EINSPARDATEN_JAHR]: [
    'endkunde_pseudonym',
    'energietraeger',
    'status',
    'ausschluss_grund_code',
    'referenz_kwh_summe',
    'ist_kwh_summe',
    'einsparung_kwh_endenergie',
    'monate_ausgewiesen',
    'monate_ersatz',
    'monate_fehlend',
    'jahres_qualitaetsstufe',
    'wiss_auswertung_ausgenommen',
  ],
  [EXPORT_DATEINAMEN.EINSPARDATEN_DIFFERENZ]: [
    'endkunde_pseudonym',
    'energietraeger',
    'wert_alt_kwh',
    'wert_neu_kwh',
    'delta_kwh',
    'differenz_richtung',
  ],
  [EXPORT_DATEINAMEN.METABLATT]: ['schluessel', 'wert'],
  [EXPORT_DATEINAMEN.MANIFEST]: ['dateiname', 'kategorie', 'zeilen_anzahl', 'sha256_hex'],
} as const satisfies Record<string, readonly string[]>;

/**
 * Auflage A12 (ADR-0007 Teil C) — „Solange Anschlussnutzer-Sperren nicht
 * auflösbar sind (ADR-0006 P4/C5): Kategorie `rohdaten` NICHT exportierbar."
 *
 * BIS 2026-08-26 hatte `analytics.berechnungslauf.mvet_id` STRUKTURELL
 * keinen Pfad zu `energy.anschlussnutzer` (die Zuordnung fehlte, ADR-0006
 * P4) — die Bedingung war damit UNBEDINGT wahr, nicht laufabhängig, und
 * diese Konstante war ein fest verdrahtetes `true`. Seit V0028
 * (`energy.messkonzept_version_energietraeger_system`) ist die Kette
 * auflösbar — die Entscheidung ist damit PRO EXPORT unterschiedlich
 * (abhängig davon, ob der gebundene Preflight `FJ-10`,
 * `KETTE_NICHT_AUFLOESBAR_REGEL_CODE` in `../verfahren.const.ts`, geführt
 * hat) und daher NICHT mehr als Modul-Konstante abbildbar — die Prüfung
 * lebt jetzt in `nachweis-export-renderer.ts`s `rohdatenErlaubt()`.
 */

/** Nachkommastellen je numerischer Spalte — Konvention exakt aus den jeweiligen DB-Spaltentypen (V0019/V0025), s. `csv.util.ts`. */
export const EXPORT_NACHKOMMASTELLEN = {
  KWH: 3,
  GRUNDLAST_ANTEIL: 3,
  GTZ: 2,
  T_MITTEL: 2,
  /** Quoten und Anteile in Prozent (V0064) — zwei Stellen, wie die Sollquoten des Merkblatts. */
  PROZENT: 2,
} as const;
