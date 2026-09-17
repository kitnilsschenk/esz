-- =====================================================================
-- V0078 -- Exportschema `nachweis_export_kanonisch` Version 5:
--          die Einsparungsnachweis-Mappe an die Vorlage angeglichen
-- =====================================================================
--
-- ANLASS
-- ------
-- Ein Zell-fuer-Zell-Vergleich der v4-Mappe gegen
-- `ESZ_Einsparungsnachweis_Vorlage.xlsx` foerderte acht Abweichungen zutage.
-- Fuenf davon waren Abweichungen ohne Gewinn und sind hier behoben:
--
-- (1) ENERGIETRAEGER IN DER SCHREIBWEISE DES FORMULARS. Die Mappe schrieb den
--     internen Code (`strom`, `waerme`); die Vorlage schreibt `Strom`, `Gas`,
--     `Waerme`. Der gravierende Fall: Blatt 7 der Vorlage summiert mit
--     SUMIFS auf die feste Zeichenkette "Strom" bzw. "Gas". Wer unsere Zahlen
--     in das Originalformular uebertraegt und dort `waerme` vorfindet,
--     bekommt NULLEN -- und sieht ihnen nicht an, dass sie falsch sind.
--
-- (2) BLATT 7 KOPFZEILE. Die Vorlage hat fest "Strom-Einsparung" und
--     "Gas-Einsparung". Die Mappe setzt eine Spalte je Energietraeger, der im
--     Buendel VORKOMMT -- sonst haette ein Waerme-Kunde keine Spalte und ein
--     Gas-Kunde eine leere. Die Benennung folgt jetzt dem Formular
--     ("<Traeger>-Einsparung [kWh]").
--
-- (3) BLATT 5 SPALTEN B, C, D TRAGEN FORMELN. Sie fuehrten Kopien von
--     Endkunde, Energietraeger und Baseline-Version; die Vorlage holt sie per
--     INDEX/MATCH. Eine Kopie bleibt stehen, wenn jemand das Systemregister
--     korrigiert -- die Mappe zeigte dann zwei verschiedene Wahrheiten.
--
-- (4) BLATT 5 SPALTE G WOERTLICH WIE DIE VORLAGE:
--     IFERROR(a0 + b1*X1 + N(b2)*N(X2), 0). Der b2-Term traegt heute 0 bei
--     (eine zweite Einflussgroesse wird nicht bestimmt), aber die Formel ist
--     damit dieselbe, und ein spaeter gefuelltes b2 wirkt ohne Codeaenderung.
--     Das IFERROR faengt eine nicht auffindbare System-ID ab.
--
-- (5) BLATT 6b OHNE BLATTUEBERGREIFENDEN KRITERIENBEREICH. Die Summe griff
--     auf `5_Einsparung!J` UND `1_Systemregister!C` zu. SUMIFS paart dabei
--     Zeile i des einen mit Zeile i des anderen Blattes -- richtig, solange
--     beide gleich sortiert bleiben, und still falsch, sobald jemand eines
--     davon sortiert. Blatt 5 traegt die Branche jetzt selbst (Spalte O,
--     INDEX/MATCH), und beide Kriterienbereiche liegen auf einem Blatt.
--
-- VIER ABWEICHUNGEN BLEIBEN -- ABSICHTLICH
-- ----------------------------------------
-- * `2_Messpunkte` Spalte C heisst "Zaehler-ID (pseudonym.)" statt
--   "Zaehler-ID (Bez.)". Der Inhalt IST ein Pseudonym; ein Kopf, der
--   "Bezeichnung" verspricht, waere schlicht unwahr.
-- * `5_Einsparung` Spalte N ("Ausgewiesene Monate") -- der Klartext zum
--   Zeitanteil-Faktor. Genau diese Spalte hat verhindert, dass die Mappe fuer
--   Pilotbestand A FJ5 eine Einsparung auswies, die es nicht gibt (0 von 13
--   getragenen Monaten). Ein nackter Faktor 0,77 ist nicht pruefbar.
-- * `5_Einsparung` Spalte O -- die Hilfsspalte aus (5).
-- * `7_Sachbericht_P13` Spalte D heisst "Waerme-Einsparung" statt
--   "Gas-Einsparung": Das ist keine Formabweichung, sondern der
--   Energietraeger, den dieses Buendel tatsaechlich enthaelt.
-- Alle drei Zusatzspalten stehen RECHTS der Vorlagenspalten. Sie verschieben
-- nichts und stoeren einen Leser nicht, der nur A-M liest.
--
-- =====================================================================
-- ZUR ZWEITEN VERSION AM SELBEN TAG
-- =====================================================================
-- v3 (V0075), v4 (V0077) und v5 (V0078) sind an einem Tag entstanden. Das ist
-- kein schoenes Bild fuer einen Katalog, der ein dauerhafter Nachweis sein
-- soll -- aber es ist der ehrliche: Es gab an diesem Tag drei
-- Rendering-Regeln, und welche ein Artefakt erzeugt hat, muss an ihm ablesbar
-- bleiben. Die Alternative waere gewesen, eine bestehende Version still
-- umzudefinieren; dann waere der Katalog huebscher und falsch.
--
-- Wie schon in V0077 teilen sich v3, v4 und v5 den Renderer: Keine der
-- Vorversionen wurde je eingereicht, sie existieren nur im
-- Entwicklungsbestand. Ein unter v3/v4 erzeugter Export meldet beim Download
-- `hash_abweichung` und ist neu zu erzeugen -- die Drift-Sicherung schlaegt
-- korrekt an. Waere je ein Export eingereicht worden, muesste sein Renderer
-- hier erhalten bleiben.

DO $$
DECLARE
    v_code text := 'nachweis_export_kanonisch';
    v_alt  analytics.verfahren_version%ROWTYPE;
BEGIN
    SELECT * INTO v_alt
      FROM analytics.verfahren_version
     WHERE code = v_code AND gueltig_bis IS NULL
     ORDER BY version DESC
     LIMIT 1;

    IF v_alt.id IS NULL THEN
        RAISE EXCEPTION 'analytics: keine offene (gueltig_bis IS NULL) Version fuer % -- Katalog in unerwartetem Zustand, Migration abgebrochen.', v_code;
    END IF;

    IF v_alt.version <> 4 THEN
        RAISE EXCEPTION 'analytics: offene Version von % ist %, erwartet 4 -- Migration abgebrochen (bereits angewendet oder Katalog seither veraendert?).', v_code, v_alt.version;
    END IF;

    UPDATE analytics.verfahren_version
       SET gueltig_bis = now()
     WHERE id = v_alt.id;

    INSERT INTO analytics.verfahren_version
        (id, code, version, parameter_schema, golden_vectors, beschreibung, aktiv, gueltig_ab)
    VALUES (
        gen_random_uuid(), v_code, 5,
        $params$
        {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$id": "urn:edms:nachweis:verfahren:nachweis_export_kanonisch:5",
          "type": "object",
          "additionalProperties": false,
          "required": ["format_optionen", "kategorien"],
          "properties": {
            "format_optionen": {"type": "array", "items": {"type": "string", "enum": ["csv", "csv+xlsx"]},
              "default": ["csv", "csv+xlsx"],
              "beschreibung": "D5: kanonischer CSV-Satz bleibt die Nachweisgrundlage. Die Einsparungsnachweis-Mappe ist zusaetzlich und ausschliesslich .xlsx -- sie IST das behoerdliche Formular."},
            "kategorien": {"type": "array", "items": {"type": "string",
                "enum": ["rohdaten", "baseline", "einflussgroessen", "einspardaten", "geraeteerkennung", "einsparungsnachweis", "meta"]},
              "const": ["rohdaten", "baseline", "einflussgroessen", "einspardaten", "geraeteerkennung", "einsparungsnachweis", "meta"],
              "beschreibung": "Unveraendert gegenueber v3/v4 -- die Aenderung betrifft ausschliesslich den INHALT von einsparungsnachweis.xlsx."},
            "modellguete": {"type": "string", "const": "je_system",
              "beschreibung": "Seit v4: Blatt 4 weist je System aus, ob die Koeffizienten gesetzt oder angepasst wurden, und traegt bei Anpassung R2, CV(RMSE), NMBE und n."},
            "energietraeger_schreibweise": {"type": "string", "const": "anzeigename",
              "beschreibung": "NEU in v5: Energietraeger erscheinen in der Schreibweise des Formulars (Strom, Waerme, Gas, Kaelte, Oel, Biomasse) statt als interner Code. Alle SUMIFS-Kriterien der Mappe beziehen sich darauf."},
            "spaltenprofil": {"type": "null", "const": null,
              "status": "weiterhin NICHT Teil dieser Migration -- O-B8 offen",
              "beschreibung": "Unveraendert gegenueber v1-v4."}
          }
        }
        $params$::jsonb,
        '[]'::jsonb,
        'Kanonisches Export-Dateibuendel je Einspar-Lauf, Version 5 (V0078). Gegenueber v4 IDENTISCH im Dateisatz und in allen CSV-Dateien -- geaendert hat sich ausschliesslich der Inhalt von einsparungsnachweis.xlsx, und zwar zugunsten der Treue zur BAFA-Vorlage: (1) Energietraeger in der Schreibweise des Formulars statt als interner Code -- Blatt 7 der Vorlage summiert auf feste Zeichenketten, ein uebertragenes "waerme" haette dort still Nullen ergeben; (2) Blatt 7 benennt seine Spalten "<Traeger>-Einsparung [kWh]"; (3) Blatt 5 Spalten B/C/D holen Endkunde, Energietraeger und Baseline-Version per INDEX/MATCH statt sie zu kopieren; (4) Blatt 5 Spalte G woertlich wie die Vorlage inkl. IFERROR und N(b2)*N(X2); (5) Blatt 6b haelt beide SUMIFS-Kriterienbereiche auf Blatt 5 (neue Hilfsspalte O), statt blattuebergreifend auf Zeilengleichheit zu bauen. Bewusst BEIBEHALTEN: Spalte C von Blatt 2 heisst "(pseudonym.)" statt "(Bez.)" -- der Inhalt ist ein Pseudonym; die Zusatzspalten N und O rechts der Vorlagenspalten. Verbleibende Kopf-Abweichungen zur Vorlage: vier, alle absichtlich und dokumentiert. v3, v4 und v5 teilen sich den Renderer (keine Vorversion wurde eingereicht) -- ein unter v3/v4 erzeugter Export meldet beim Download hash_abweichung und ist neu zu erzeugen.',
        true, now());
END
$$;

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration)
-- =====================================================================
-- Keine eigene `audit.katalog.geaendert`-Zeile: Ein SQL-Migrationsskript kann
-- keinen validierten `actor_*`-Principal herstellen. Nachzutragen als
-- operativer Schritt mit echtem Principal.
