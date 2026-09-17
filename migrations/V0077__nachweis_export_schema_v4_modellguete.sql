-- =====================================================================
-- V0077 -- Exportschema `nachweis_export_kanonisch` Version 4:
--          Modellguete in der Einsparungsnachweis-Mappe
-- =====================================================================
--
-- ANLASS
-- ------
-- Die Vorlage fuehrt in Blatt 4 die Spalten „Modelltyp" und „Modellguete R²".
-- Unter v3 blieben beide unbefriedigend: Spalte D trug nur das
-- Bereinigungsverfahren, Spalte J war IMMER leer -- richtig fuer das
-- vereinfachte Messkonzept, das nichts anpasst, aber eben nur dafuer.
--
-- Seit V0076 rechnet die Plattform auch das Standard-Messkonzept (Merkblatt
-- Technik Kap. 2.2.2, Baseline durch Vermessung). Dort entstehen a0 und b1
-- durch Anpassung an gemessene Monatswerte, und damit existiert eine
-- belegbare Guete. Sie gehoert in den Nachweis -- sonst haette die Software
-- die Zahl, und der Empfaenger bekaeme sie nicht.
--
-- Neu in der Mappe:
--   * Blatt 4 Spalte D nennt den WEG zu den Koeffizienten (gesetzt oder
--     angepasst), nicht mehr nur das Bereinigungsverfahren.
--   * Blatt 4 Spalte J traegt R², wo angepasst wurde; bei vereinfachten
--     Systemen bleibt sie leer wie bisher.
--   * Blatt 4 bekommt darunter eine zweite Tabelle mit R², CV(RMSE), NMBE,
--     n und dem Abstand zur nach TB-02 erfassten Baseline.
--   * Das Anleitungsblatt erklaert beide Wege -- auch im gemischten Buendel,
--     wo gefuellte und leere Guete-Zeilen nebeneinander stehen und ohne
--     Erklaerung wie eine Luecke aussaehen.
--
-- WARUM R² NICHT ALLEIN STEHT
-- ---------------------------
-- Bei waermegefuehrten Traegern erzeugt schon der Sommer-Winter-Kontrast ein
-- hohes R², auch wenn das Modell in den Uebergangsmonaten daneben liegt.
-- CV(RMSE) zeigt das, n macht R² ueberhaupt erst bewertbar, und NMBE deckt
-- einen systematischen Versatz auf. Eine Zahl allein waere leichter zu lesen
-- und leichter misszuverstehen.
--
-- =====================================================================
-- WARUM EINE NEUE VERSION (unveraendert die Begruendung aus V0064/V0075)
-- =====================================================================
-- Der Download RENDERT einen bestehenden Export NEU und vergleicht gegen
-- seinen gespeicherten Hash (ADR-0007 D5/B5).
--
-- ANMERKUNG ZU DEN BESTEHENDEN v3-EXPORTEN: Version 3 entstand am selben Tag
-- wie diese Migration und existiert bisher nur im Entwicklungsbestand; kein
-- v3-Export wurde je eingereicht. `waehleRenderer` bildet v3 und v4 deshalb
-- auf DENSELBEN Renderer ab, statt den alten Mappen-Code als Altlast
-- mitzuschleppen. Folge: Ein unter v3 erzeugter Export meldet beim Download
-- eine Hash-Abweichung. Das ist die Drift-Sicherung, die korrekt anschlaegt --
-- das Rendering HAT sich geaendert -- und kein stiller Fehler. Solche Exporte
-- sind neu zu erzeugen. Waere je ein v3-Export eingereicht worden, muesste
-- hier stattdessen ein eigener v3-Renderer stehen gebleiben sein.

-- =====================================================================
-- (1) SCD2 auf dem Verfahrenskatalog: v3 schliessen, v4 oeffnen
-- =====================================================================

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

    IF v_alt.version <> 3 THEN
        RAISE EXCEPTION 'analytics: offene Version von % ist %, erwartet 3 -- Migration abgebrochen (bereits angewendet oder Katalog seither veraendert?).', v_code, v_alt.version;
    END IF;

    UPDATE analytics.verfahren_version
       SET gueltig_bis = now()
     WHERE id = v_alt.id;

    INSERT INTO analytics.verfahren_version
        (id, code, version, parameter_schema, golden_vectors, beschreibung, aktiv, gueltig_ab)
    VALUES (
        gen_random_uuid(), v_code, 4,
        $params$
        {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$id": "urn:edms:nachweis:verfahren:nachweis_export_kanonisch:4",
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
              "beschreibung": "Unveraendert gegenueber v3 -- die Aenderung betrifft ausschliesslich den INHALT von einsparungsnachweis.xlsx, nicht den Dateisatz."},
            "modellguete": {"type": "string", "const": "je_system",
              "beschreibung": "NEU in v4: Blatt 4 weist je System aus, ob die Koeffizienten gesetzt oder angepasst wurden, und traegt bei Anpassung R2, CV(RMSE), NMBE und n. Bei vereinfachtem Messkonzept bleiben die Guetespalten leer -- es wurde nichts angepasst."},
            "spaltenprofil": {"type": "null", "const": null,
              "status": "weiterhin NICHT Teil dieser Migration -- O-B8 offen",
              "beschreibung": "Unveraendert gegenueber v1/v2/v3."}
          }
        }
        $params$::jsonb,
        '[]'::jsonb,
        'Kanonisches Export-Dateibuendel je Einspar-Lauf, Version 4 (V0077). Gegenueber v3 IDENTISCH im Dateisatz und in allen CSV-Dateien -- geaendert hat sich ausschliesslich der Inhalt von einsparungsnachweis.xlsx, Blatt 4 (Baseline-Modell): Spalte "Modelltyp" nennt jetzt den Weg zu den Koeffizienten (normativ gesetzt beim vereinfachten Messkonzept, an die Vermessung angepasst beim Standard-/alternativen, V0076), Spalte "Modellguete R2" traegt bei Anpassung die Zahl statt leer zu bleiben, und darunter steht eine Guetetabelle mit R2, CV(RMSE), NMBE, n und dem Abstand zur nach TB-02 erfassten Baseline. R2 ist zentriert definiert und darf negativ sein. Bei vereinfachtem Messkonzept bleibt die Guete leer wie in v3 -- dort wurde nichts angepasst, und das Merkblatt verlangt fuer Kap. 2.1.2 auch keine Guete. Das Anleitungsblatt erklaert beide Wege, auch im gemischten Buendel. HINWEIS: v3 und v4 teilen sich den Renderer (v3 entstand am selben Tag, nur im Entwicklungsbestand, nie eingereicht) -- ein unter v3 erzeugter Export meldet beim Download folglich eine Hash-Abweichung und ist neu zu erzeugen.',
        true, now());
END
$$;

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration)
-- =====================================================================
-- Keine eigene `audit.katalog.geaendert`-Zeile: Ein SQL-Migrationsskript kann
-- keinen validierten `actor_*`-Principal herstellen. Nachzutragen als
-- operativer Schritt mit echtem Principal.
