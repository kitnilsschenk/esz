/**
 * ADR-0006 O-B1 (GESCHLOSSEN, `compliance-director`-Votum 2026-07-24) +
 * `.claude/rules/dependencies.md` Abschnitt "Datenlizenzen" (Auflage A-1,
 * `docs/datenquellen.md` DQ-001): DWD Open Data/CDC, Lizenz CC BY 4.0 bzw.
 * GeoNutzV. Attribution ist Pflicht in Repo-Doku, BAFA-/Nachweis-Exporten und
 * kundengerichteten Darstellungen abgeleiteter Werte (Gradtagzahlen,
 * bereinigte Einsparwerte) — EINE zentrale Konstante, von JEDEM Ausgabepfad
 * referenziert statt dupliziert (`dependencies.md`: "kein Duplizieren von
 * Vermerkstexten").
 *
 * AUFLAGE A-1 ERFÜLLT (Freigabe des Users am 2026-09-09). Bis dahin stand
 * hier ein Platzhalter; er hat den Förderjahr-Preflight (`FJ-08`) und die
 * Erzeugung von Kundendokumenten mit DWD-Werten fail-closed blockiert.
 *
 * **Woher der Wortlaut stammt.** Die Fundstellenkette endet NICHT in
 * `Nutzungsbedingungen_German.pdf`: Das PDF (Stand Mai 2024, eine Seite)
 * nennt nur die Lizenz CC BY 4.0 und verweist auf `www.dwd.de/copyright`.
 * Von dort führt „Rechtliche Hinweise" auf die Seite **„Vorgaben für die
 * Gestaltung des DWD-Quellenvermerks"**
 * (`https://www.dwd.de/DE/service/rechtliche_hinweise/vorlagen_quellenangabe.html`,
 * abgerufen 2026-09-09). Erst dort steht der Wortlaut, und zwar als Vorgabe
 * nach § 7 DWD-Gesetz. Die vollständige Kette samt Abrufdaten steht in
 * `docs/datenquellen.md` DQ-001.
 *
 * **Warum GENAU dieser Text und kein Zusatz.** Der DWD ist der Lizenzgeber
 * und gibt selbst vor, was er als Quellenvermerk erwartet — „In Textform:
 * Quelle: Deutscher Wetterdienst". Diese Vorgabe wörtlich zu übernehmen ist
 * die sicherste Auslegung. Ein selbst formulierter Zusatz (etwa eine
 * angehängte Lizenzkennung) wäre kein wörtliches Zitat mehr und damit genau
 * das, was A-1 verhindern soll; die Lizenzangabe gehört stattdessen in die
 * Zeile der Datenherkunft (`analytics.klima_tag.lizenz_id`, V0063) und ins
 * Register.
 *
 * Der `SyntheticKlimaQuelleAdapter` referenziert diese Konstante
 * AUSDRÜCKLICH NICHT (s. dortiger Kommentar — synthetische Werte sind keine
 * DWD-Daten, eine Attribution wäre hier sachlich falsch).
 */
export const DWD_QUELLENVERMERK = 'Quelle: Deutscher Wetterdienst';

/**
 * Auflage A-2 (`docs/datenquellen.md` DQ-001, "Wo die Attribution erscheinen
 * muss"): CC BY 4.0 Art. 3(a)(i)(B) verlangt zusätzlich zum Quellenvermerk die
 * Kennzeichnung, DASS und WIE die Daten verändert wurden. Für das EDMS ist die
 * Veränderung die Aggregation der DWD-Tagesmitteltemperaturen zu Gradtagzahlen.
 *
 * Fehlte bis 2026-08-20 (Fund `technical-director` bei ADR-0007 Teil B):
 * `docs/datenquellen.md` führte den Vermerk bereits, der Code aber nur den
 * Quellenvermerk — die Auflage wäre in jedem Export unerfüllt gewesen. Er
 * gehört als zweites Feld NEBEN `DWD_QUELLENVERMERK` in dieselbe zentrale
 * Konstante und NICHT in den Export-Renderer (sonst Duplizierung über
 * BAFA-Export, Nutzerinformation und UI hinweg — `dependencies.md`: "kein
 * Duplizieren von Vermerkstexten").
 *
 * Seit dem 2026-09-09 folgt der Text dem Muster, das der DWD auf derselben
 * Seite für Veränderungshinweise vorgibt („Datenbasis: Deutscher
 * Wetterdienst, …", dort mit dem Beispiel gemittelter Einzelwerte). Was
 * hinter dem Komma steht, beschreibt UNSERE Verarbeitung und ist deshalb
 * — anders als der Quellenvermerk — kein Zitat: die Aggregation zu
 * Gradtagzahlen nach VDI 3807.
 */
export const DWD_AENDERUNGSVERMERK =
  'Datenbasis: Deutscher Wetterdienst, Einzelwerte zu Gradtagzahlen nach VDI 3807 aggregiert.';

/**
 * Der Marker, an dem ein Platzhalter erkennbar wäre.
 *
 * Er stand bis 2026-09-09 als lokale Konstante im `PreflightService` — an
 * genau einer Stelle, weil es genau einen Prüfer gab. Inzwischen gibt es
 * zwei: den Förderjahr-Preflight (FJ-08, Nachweis an die
 * Bewilligungsbehörde) und die Erzeugung des Kundendokuments. Der Marker
 * gehört deshalb neben den Text, den er beschreibt — sonst driftet die
 * zweite Kopie irgendwann von der ersten weg, und genau dann greift ein
 * Riegel nicht mehr.
 */
export const DWD_PLATZHALTER_MARKER = 'PLATZHALTER';

/**
 * `true`, solange der Quellenvermerk noch ein Platzhalter ist.
 *
 * Seit der A-1-Freigabe (2026-09-09) ist das `false`, und beide Riegel —
 * `FJ-08` und die Dokumentenerzeugung — greifen nicht mehr. Sie bleiben
 * trotzdem stehen: Sie kosten nichts und fangen den Fall, dass jemand den
 * Text später wieder durch einen Entwurf ersetzt. Ein Platzhalter IN einer
 * Ausgabe wäre schlimmer als gar kein Vermerk — er behauptet eine Quelle und
 * verrät im selben Satz, dass die Behauptung nicht abgenommen ist.
 */
export function istQuellenvermerkPlatzhalter(): boolean {
  return DWD_QUELLENVERMERK.includes(DWD_PLATZHALTER_MARKER);
}
