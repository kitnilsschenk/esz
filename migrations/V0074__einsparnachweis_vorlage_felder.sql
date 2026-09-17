-- =====================================================================
-- V0074 -- Drei Angaben, die der Einsparungsnachweis verlangt und die im
--          Schema fehlten: Richtung eines Messpunkts, Endkundengruppe,
--          Standort eines Systems.
-- =====================================================================
--
-- ANLASS
-- ------
-- Die Vorlage `ESZ_Einsparungsnachweis_Vorlage.xlsx` (End-Verwendungsnachweis,
-- Basis [Q3] Kap. 9 + VN-Merkblatt Kap. 4.3.4) verlangt Angaben, die das
-- Datenmodell nicht fuehrt. Drei davon sind nicht aus Vorhandenem herleitbar
-- und werden hier ergaenzt. Alles Weitere (Regressionskoeffizienten,
-- Modellguete R², ausgeschlossene Zeitraeume, Primaerenergiefaktor) bleibt
-- bewusst offen -- s. Fussnote am Ende.
--
-- =====================================================================
-- 1. energy.messkanal.richtung -- Bezug / Eigenerzeugung / Einspeisung
-- =====================================================================
-- Blatt `2_Messpunkte` der Vorlage fuehrt je Messpunkt eine Richtung, und
-- Blatt `3_System_Ist` rechnet daraus:
--
--     Ist-Verbrauch = Σ Bezug + Eigenerzeugung − Einspeisung
--
-- Das Schema kannte diese Unterscheidung NICHT. `messkanal.art` trennt
-- kumulativen Zaehlerstand von Intervallverbrauch, `ist_untermessung`
-- (V0058) beschreibt die Topologie -- beides sagt nichts darueber, ob ein
-- Kanal Energie bezieht oder abgibt. Bis heute war die einzige Fundstelle
-- der Unterscheidung FREITEXT in `messkonzept_version.systemgrenze`
-- ("Die BHKW-Waermeerzeugung liegt ausserhalb -- sie ist Erzeugung, kein
-- Verbrauch"). Eine Prosa-Angabe kann keine Bilanz rechnen.
--
-- Die Anleitung der Vorlage macht daraus einen Pruefpunkt: "'Separat
-- ausgewiesen' ggue. Netzbezug ist erfuellt, solange dieser MP getrennt vom
-- Netzbezug erfasst ist. Selbsterzeugter Strom (PV+BHKW) ist KEINE
-- Einsparung." Ohne das Feld laesst sich diese Erfuellung nicht zeigen.
--
-- WARUM `bezug` ALS DEFAULT UND NICHT NULL
-- ----------------------------------------
-- Ein NULL-Wert hiesse "unbekannt", und eine Bilanz ueber unbekannte
-- Richtungen ist keine Bilanz -- der Export muesste jeden solchen Kanal
-- auslassen oder raten. `bezug` ist fuer den Bestand nachweislich richtig:
-- Saemtliche heute erfassten Kanaele messen Verbrauch; die einzige
-- Erzeugungsanlage im Bestand (BHKW des Pilotbestands A) ist ausdruecklich
-- ausserhalb der Systemgrenze gefuehrt.
--
-- ABER: Ein faelschlich als `bezug` gefuehrter Einspeisekanal erhoeht den
-- ausgewiesenen Ist-Verbrauch und senkt damit die Einsparung. Der Default
-- ist eine ANNAHME ueber Bestandsdaten, keine Messung. Vor dem ersten
-- echten Verwendungsnachweis ist er je Kanal zu bestaetigen; die
-- Oberflaeche zeigt die Richtung deshalb an jedem Messkanal an.
--
-- Hinweis fuer die Pruefung: Bei Strom traegt `obis_kennzahl` die Antwort
-- oft schon (1-0:1.8.x = Bezug, 1-0:2.8.x = Lieferung). Das Feld wird hier
-- NICHT automatisch ausgewertet -- es ist nullable, nur bei Strom gefuellt
-- und im Bestand ungeprueft; eine stille Ableitung waere genau die Sorte
-- plausibler Falschannahme, die dieser Kommentar verhindern soll.

ALTER TABLE energy.messkanal
    ADD COLUMN richtung text NOT NULL DEFAULT 'bezug';

ALTER TABLE energy.messkanal
    ADD CONSTRAINT ck_messkanal_richtung
        CHECK (richtung IN ('bezug', 'eigenerzeugung', 'einspeisung'));

COMMENT ON COLUMN energy.messkanal.richtung IS
  'pii=false; Energierichtung des Messpunkts (V0074, Einsparungsnachweis Blatt 2/3): bezug = Netzbezug/Verbrauch, eigenerzeugung = selbst erzeugte und selbst genutzte Energie, einspeisung = Abgabe ins Netz. Ist-Verbrauch = Σ bezug + eigenerzeugung − einspeisung ([Q3] Kap. 9). Default bezug ist eine ANNAHME ueber den Bestand (alle heute erfassten Kanaele messen Verbrauch), keine Messung -- vor dem ersten Verwendungsnachweis je Kanal zu bestaetigen. NICHT aus obis_kennzahl abgeleitet: die ist nullable, nur bei Strom gefuellt und im Bestand ungeprueft.';

-- =====================================================================
-- 2. energy.endkunde.endkundengruppe -- die Branche
-- =====================================================================
-- Die Vorlage fuehrt sie in drei Blaettern: `1_Systemregister` (Stammdaten),
-- `6b_LK_Endkundengruppe` (Aufschluesselung Energietraeger × Gruppe fuer das
-- BAFA-Formular "Nachweis der leistungsabhaengigen Komponente") und
-- `7_Sachbericht_P13` (Einzelaufschluesselung je Endkunde mit Branche).
--
-- `energy.endkunde.rechtsform_kategorie` (V0050) ist etwas anderes und kein
-- Ersatz: Sie unterscheidet natuerliche Person / Personengesellschaft /
-- juristische Person und dient der DSGVO-Dokumentation. Ein Kreditinstitut
-- und eine Baeckerei sind beide juristische Personen.
--
-- WARUM FREITEXT UND KEINE WERTELISTE
-- -----------------------------------
-- Eine geschlossene Liste waere besser -- Blatt 6b aggregiert ueber sie, und
-- ein Tippfehler spaltet eine Gruppe in zwei. Die maßgebliche Liste ist die
-- des BAFA-LK-Formulars, und die liegt dem Repository NICHT vor
-- (`compliance/foerderauflagen/quellen/` enthaelt die vier technischen
-- Merkblaetter, nicht das VN-Merkblatt). Eine selbst erfundene Kategorien-
-- liste, die dann nicht zu der des Formulars passt, waere schlechter als
-- Freitext: Sie saehe verbindlich aus und muesste beim ersten echten
-- Nachweis wieder umgeschluesselt werden.
--
-- Erweiterungsstelle ausdruecklich benannt: Sobald das VN-Merkblatt bzw. das
-- LK-Formular vorliegt, wird daraus eine Katalogtabelle mit FK -- additiv,
-- mit Abgleich der dann vorhandenen Freitexte.
--
-- DSGVO
-- -----
-- pii=indirekt. Die Branche allein identifiziert niemanden, in Verbindung
-- mit einem Standort kann sie die Menge der in Frage kommenden Personen
-- erheblich verengen (ein Kreditinstitut in einer Kleinstadt). Sie steht
-- deshalb bewusst NICHT in `identity.*` -- der BAFA-Nachweis verlangt sie
-- ausdruecklich in der pseudonymisierten Aufstellung (Blatt 7), und ein
-- feldverschluesselter Wert waere dort nicht aggregierbar. Review-Bedarf:
-- `compliance-director` (Art.-30-Eintrag: neue Datenkategorie am Endkunden).

ALTER TABLE energy.endkunde
    ADD COLUMN endkundengruppe text;

ALTER TABLE energy.endkunde
    ADD CONSTRAINT ck_endkunde_endkundengruppe_nicht_leer
        CHECK (endkundengruppe IS NULL OR length(btrim(endkundengruppe)) > 0);

COMMENT ON COLUMN energy.endkunde.endkundengruppe IS
  'pii=indirekt; Endkundengruppe/Branche (V0074) fuer den LK-Nachweis (Einsparungsnachweis Blatt 1/6b/7, BAFA-Formular "Nachweis der leistungsabhaengigen Komponente"). FREITEXT, weil die maßgebliche Werteliste des LK-Formulars dem Repo nicht vorliegt -- eine erfundene Kategorienliste saehe verbindlich aus und muesste beim ersten echten Nachweis umgeschluesselt werden; Erweiterung zur Katalogtabelle ist additiv vorgesehen. NICHT zu verwechseln mit rechtsform_kategorie (V0050, DSGVO-Dokumentation). Verlaesst das System im pseudonymisierten Nachweis -- das ist der Zweck der Angabe.';

-- =====================================================================
-- 3. energy.system.standort_id -- der Standort eines Systems
-- =====================================================================
-- Die Vorlage definiert die Berechnungseinheit woertlich: "1 System = 1
-- Energietraeger an 1 STANDORT eines Endkunden." Blatt 1 fuehrt den Standort
-- als Stammdatum je System.
--
-- `energy.standort` existiert seit V0017 vollstaendig (ADR-0010), haengt aber
-- am ZAEHLER (`energy.zaehler_standort`, temporal). Der Standort eines
-- Systems war daraus nur indirekt und potenziell MEHRDEUTIG herleitbar:
-- Ein System mit fuenf Zaehlern an drei Standorten haette drei Antworten.
--
-- Die Zaehler-Verortung bleibt unveraendert und ist NICHT redundant zu
-- diesem Feld -- sie ist feiner (Raum/Etage, temporal) und beantwortet eine
-- andere Frage ("wo haengt dieses Geraet"). Das Systemfeld beantwortet "auf
-- welche Liegenschaft bezieht sich diese Berechnungseinheit".
--
-- NULLABLE, weil Bestandssysteme keinen haben und eine Pflichtangabe jeden
-- bestehenden Schreibpfad bräche. Der Export weist einen fehlenden Standort
-- sichtbar aus, statt ihn zu erfinden.
--
-- Der ZUSAMMENGESETZTE Fremdschluessel erzwingt, dass der Standort DEMSELBEN
-- Endkunden gehoert -- dasselbe Muster wie V0028 (mvet × System) und aus
-- demselben Grund: Ein Standort eines fremden Kunden waere ein
-- Mandantenbruch, und ein einfacher FK auf `standort(id)` wuerde ihn
-- durchlassen. `ux_standort_id_endkunde` existiert bereits (V0017).

ALTER TABLE energy.system
    ADD COLUMN standort_id uuid;

ALTER TABLE energy.system
    ADD CONSTRAINT fk_system_standort_mandant
        FOREIGN KEY (standort_id, endkunde_id)
        REFERENCES energy.standort (id, endkunde_id);

CREATE INDEX ix_system_standort ON energy.system (standort_id) WHERE standort_id IS NOT NULL;

COMMENT ON COLUMN energy.system.standort_id IS
  'pii=false; Standort (Liegenschaft/Gebaeude) dieser Berechnungseinheit (V0074). Die Vorlage des Einsparungsnachweises definiert: "1 System = 1 Energietraeger an 1 Standort eines Endkunden." NICHT redundant zu energy.zaehler_standort: die ist feiner (Raum/Etage) und temporal und sagt, wo ein GERAET haengt; dieses Feld sagt, worauf sich die Berechnungseinheit bezieht. Zusammengesetzter FK (standort_id, endkunde_id) erzwingt denselben Mandanten -- Muster aus V0028. Nullable: Bestandssysteme haben keinen, und der Export weist das aus statt es zu erfinden.';

-- =====================================================================
-- WAS DIESE MIGRATION BEWUSST NICHT ERGAENZT
-- =====================================================================
-- Die Vorlage verlangt weitere Angaben, die hier NICHT nachgezogen werden,
-- weil sie keine fehlenden Spalten sind, sondern fehlende Fachfunktionen
-- bzw. offene Entscheidungen:
--
--   * Regressionskoeffizienten b₁/b₂ und Modellguete R² (Blatt 4). Die
--     Vorlage ist fuer das STANDARD-Messkonzept gebaut; die Software rechnet
--     das vereinfachte (ADR-0006 F1 = (a), vom User gesetzt). Das Modell
--     laesst sich in die lineare Form ueberfuehren -- a₀ = B·g,
--     b₁ = B·(1−g)/GTZ_base --, aber es wurde nichts GEFITTET, und R² gibt
--     es deshalb nicht. Eine Spalte anzulegen, die dauerhaft leer bleibt,
--     waere eine Behauptung ueber eine Faehigkeit, die nicht existiert.
--   * Ausgeschlossene/bereinigte Zeitraeume (Blatt 4 Spalte K).
--     `energy.baseline_periode` ist eine EINSCHLUSSliste; eine
--     Ausschluss-/Sondereffekt-Tabelle gibt es nicht. Eigene fachliche
--     Entscheidung (`baseline-engineer`), nicht Beiwerk dieser Migration.
--   * Primaerenergiefaktor (Blatt 5 Spalte K/L). Als additive Naht in
--     ADR-0007 B8/D8 vorgesehen und dort GESPERRT (O2b: Faktorquelle ist
--     lizenz- und attributionspflichtig, Freigabe `compliance-director`
--     ausstehend). Die Vorlage selbst setzt PEF = 1 als Vorgabe und
--     verlangt eine Abweichung nur bei Substitutionsbilanzierung -- der
--     Export schreibt deshalb 1 und vermerkt es.
--
-- Review-Bedarf: `compliance-director` (endkundengruppe, Art.-30-Eintrag),
-- `database-lead` (Constraints/Index), `baseline-engineer` (Richtungs-
-- Default gegen den Bestand).
