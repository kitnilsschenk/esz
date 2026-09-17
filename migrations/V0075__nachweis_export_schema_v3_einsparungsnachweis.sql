-- =====================================================================
-- V0075 -- Exportschema `nachweis_export_kanonisch` Version 3:
--          die Einsparungsnachweis-Mappe als zusaetzliche Datei
-- =====================================================================
--
-- ANLASS
-- ------
-- Die Bewilligungsbehoerde erwartet den technischen Erfolgsnachweis in der
-- Form der Vorlage `ESZ_Einsparungsnachweis_Vorlage.xlsx`
-- (End-Verwendungsnachweis, Basis [Q3] Kap. 9 + VN-Merkblatt Kap. 4.3.4):
-- neun Blaetter von den Systemstammdaten ueber Messpunkte, Baseline-Modell
-- und Einsparung je System bis zur Aggregation je Energietraeger und je
-- Endkundengruppe.
--
-- Das bisherige Buendel (Schema v2) enthaelt DIESELBEN Zahlen -- aber als
-- elf einzelne CSV-Dateien in der DE-03-Gliederung. Der Empfaenger muesste
-- sie selbst zur Nachweisform zusammensetzen. Genau diese Arbeit nimmt die
-- Mappe ab.
--
-- =====================================================================
-- WARUM EINE NEUE VERSION UND KEIN ANHAENGEN (unveraendert die Begruendung
-- aus V0064)
-- =====================================================================
-- Der Download RENDERT einen bestehenden Export NEU und vergleicht gegen
-- seinen gespeicherten Hash (ADR-0007 D5/B5). Wuerde v2 ab sofort eine Datei
-- MEHR erzeugen, aenderte sich das Rendering auch fuer bereits EINGEREICHTE
-- Exporte: ihr Manifest-Hash passte nicht mehr, und ein korrekt eingereichter
-- Nachweis erschiene rueckwirkend als gedriftet.
--
-- =====================================================================
-- EIGENE KATEGORIE `einsparungsnachweis`
-- =====================================================================
-- Die Mappe ist keine der DE-03-Kategorien -- sie enthaelt Anteile aus
-- mehreren (Baseline, Einspardaten, Geraeteerkennung) in der Gliederung des
-- BEHOERDLICHEN Formulars statt in der des Datenkatalogs. Sie unter
-- `einspardaten` zu fuehren waere irrefuehrend: Wer dort sucht, sucht die
-- Rohtabelle. Dieselbe Begruendung wie bei `geraeteerkennung` in V0064 --
-- „eine Datei unter falscher Kategorie waere beim Empfaenger schwerer zu
-- finden als eine zusaetzliche Kategorie".
--
-- =====================================================================
-- WAS DIE MAPPE NICHT LEISTET -- und warum das so bleibt
-- =====================================================================
-- Die Vorlage traegt im Titel „Standard-Messkonzept" und modelliert die
-- Baseline als lineare Regression `E = a₀ + b₁·X₁ + b₂·X₂` mit Modellguete.
-- Die Software rechnet das VEREINFACHTE Messkonzept (ADR-0006 F1 = (a), vom
-- User gesetzt; „Regressionsmodelle fuer Einflussgroessen" stehen dort
-- ausdruecklich ausserhalb des Scopes).
--
-- Das Modell laesst sich in die lineare Form UEBERFUEHREN -- die
-- Witterungsbereinigung IST linear in der Gradtagzahl:
--
--     a₀ = B · g                 (Grundlast, witterungsunabhaengig)
--     b₁ = B · (1 − g) / GTZ_base
--     X₁ = Σ GTZ_ist ueber den Zeitraum
--
-- Gegen den Pilotbestand A geprueft: a₀ = 2 633,4 kWh, b₁ = 4,913 kWh/Kd,
-- und die so gerechnete Jahresreferenz weicht um 0,009 % von der des
-- gespeicherten Laufs ab (Rundung der Monatswerte).
--
-- NICHT uebertragbar sind:
--   * Modellguete R² -- es wurde nichts GEFITTET. Die Spalte bleibt leer.
--     Eine Zahl dort hinzuschreiben waere die Behauptung einer Guete, die
--     nicht gemessen wurde.
--   * Zweite Einflussgroesse b₂ -- in v1 nicht vorgesehen.
--   * Ausgeschlossene/bereinigte Zeitraeume -- `energy.baseline_periode` ist
--     eine EINSCHLUSSliste; eine Ausschlusstabelle gibt es nicht.
--   * Primaerenergiefaktor -- in ADR-0007 B8/D8 als additive Naht vorgesehen
--     und dort GESPERRT (O2b: Faktorquelle lizenz-/attributionspflichtig,
--     Freigabe `compliance-director` ausstehend). Die Vorlage setzt PEF = 1
--     als Vorgabe; die Mappe schreibt 1 und vermerkt es im Anleitungsblatt.
--
-- Die Mappe sagt all das in ihrem Anleitungsblatt. Ein Nachweis, der eine
-- Methode vorgibt, die er nicht angewandt hat, waere schlimmer als einer, der
-- seine Grenzen benennt.
--
-- Review-Bedarf: `bafa-export-engineer`, `baseline-engineer` (Abbildung des
-- vereinfachten Modells auf die Regressionsform), `compliance-director`
-- (Endkundengruppe im pseudonymisierten Nachweis).

-- =====================================================================
-- (1) Kategorie und Dateiname
-- =====================================================================

ALTER TABLE nachweis.export_datei
    DROP CONSTRAINT ck_export_datei_kategorie,
    DROP CONSTRAINT ck_export_datei_kategorie_dateiname;

ALTER TABLE nachweis.export_datei
    ADD CONSTRAINT ck_export_datei_kategorie CHECK (
        kategorie IN ('rohdaten', 'baseline', 'einflussgroessen', 'einspardaten',
                      'geraeteerkennung', 'einsparungsnachweis', 'meta')
    ),
    ADD CONSTRAINT ck_export_datei_kategorie_dateiname CHECK (
        (kategorie = 'rohdaten'            AND dateiname ~ '^rohdaten_messwert_tag\.(csv|xlsx)$')
     OR (kategorie = 'baseline'            AND dateiname ~ '^(baseline_lauf|baseline_klima_tag)\.(csv|xlsx)$')
     OR (kategorie = 'einflussgroessen'    AND dateiname ~ '^einflussgroessen_intervall\.(csv|xlsx)$')
     OR (kategorie = 'einspardaten'        AND dateiname ~ '^(einspardaten_monat|einspardaten_jahr|einspardaten_differenz)\.(csv|xlsx)$')
     OR (kategorie = 'geraeteerkennung'    AND dateiname ~ '^(geraeteerkennung_quote|geraeteerkennung_gruppe)\.(csv|xlsx)$')
     OR (kategorie = 'einsparungsnachweis' AND dateiname ~ '^einsparungsnachweis\.xlsx$')
     OR (kategorie = 'meta'                AND dateiname ~ '^(metablatt|manifest)\.(csv|xlsx)$')
    );

COMMENT ON CONSTRAINT ck_export_datei_kategorie_dateiname ON nachweis.export_datei IS
  'Auflage A19 (ADR-0007 Teil C): entitaetsfreie, geschlossene, kategoriebasierte Dateinamensliste -- verhindert strukturell, dass ein Pseudonym/eine Entitaets-ID jemals Bestandteil eines Dateinamens wird. Kategorie geraeteerkennung seit V0064 (v2, TB-05), einsparungsnachweis seit V0075 (v3, Nachweis-Mappe in der Form der BAFA-Vorlage). Die Mappe ist als EINZIGE Datei ausschliesslich .xlsx -- sie IST das Formular, und ein CSV-Abzug davon waere weder das Formular noch eine Tabelle.';

-- =====================================================================
-- (2) SCD2 auf dem Verfahrenskatalog: v2 schliessen, v3 oeffnen
-- =====================================================================
-- Dieselbe Annahme wie V0064: `now()` ist innerhalb EINER Transaktion stabil,
-- damit `alte_version.gueltig_bis = neue_version.gueltig_ab` exakt gilt und
-- `ex_verfahren_version_no_overlap` die neue Zeile annimmt.

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

    IF v_alt.version <> 2 THEN
        RAISE EXCEPTION 'analytics: offene Version von % ist %, erwartet 2 -- Migration abgebrochen (bereits angewendet oder Katalog seither veraendert?).', v_code, v_alt.version;
    END IF;

    UPDATE analytics.verfahren_version
       SET gueltig_bis = now()
     WHERE id = v_alt.id;

    INSERT INTO analytics.verfahren_version
        (id, code, version, parameter_schema, golden_vectors, beschreibung, aktiv, gueltig_ab)
    VALUES (
        gen_random_uuid(), v_code, 3,
        $params$
        {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$id": "urn:edms:nachweis:verfahren:nachweis_export_kanonisch:3",
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
              "beschreibung": "DE-03-Kategorien plus geraeteerkennung (TB-05, v2) plus einsparungsnachweis (v3), deckungsgleich mit dem DB-CHECK auf nachweis.export_datei.kategorie."},
            "spaltenprofil": {"type": "null", "const": null,
              "status": "weiterhin NICHT Teil dieser Migration -- O-B8 offen",
              "beschreibung": "Unveraendert gegenueber v1/v2."}
          }
        }
        $params$::jsonb,
        '[]'::jsonb,
        'Kanonisches Export-Dateibuendel je Einspar-Lauf, Version 3 (V0075). Gegenueber v2 UNVERAENDERT in allen bestehenden Dateien -- ergaenzt ausschliesslich einsparungsnachweis.xlsx: den technischen Erfolgsnachweis in der Form der BAFA-Vorlage (neun Blaetter, [Q3] Kap. 9 + VN-Merkblatt Kap. 4.3.4). Die Mappe enthaelt dieselben Zahlen wie die CSVs, aber in der Gliederung des behoerdlichen Formulars statt der des Datenkatalogs. Sie traegt FORMELN, nicht nur Werte: die Aggregationsblaetter rechnen sich aus den Eingabeblaettern selbst, damit der Empfaenger jede Zahl nachvollziehen kann. Grenzen im Anleitungsblatt benannt: Die Vorlage ist fuer das Standard-Messkonzept gebaut, die Software rechnet das vereinfachte (ADR-0006 F1=(a)); das Modell wird in die lineare Form ueberfuehrt (a0 = B*g, b1 = B*(1-g)/GTZ_base), Modellguete R2 bleibt leer (es wurde nichts gefittet), PEF = 1 (ADR-0007 O2b gesperrt). Neue Version statt Anhang, weil der Download bestehende Exporte NEU RENDERT und gegen ihren Hash prueft.',
        true, now());
END
$$;

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration)
-- =====================================================================
-- Keine eigene `audit.katalog.geaendert`-Zeile: Ein SQL-Migrationsskript kann
-- keinen validierten `actor_*`-Principal herstellen. Nachzutragen als
-- operativer Schritt mit echtem Principal.
