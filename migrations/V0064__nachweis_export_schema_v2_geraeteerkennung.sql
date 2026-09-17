-- V0064__nachweis_export_schema_v2_geraeteerkennung.sql
--
-- Exportschema `nachweis_export_kanonisch` Version 2: zwei zusaetzliche
-- Dateien fuer den Nachweis der Geraeteerkennungs-Quote (TB-05).
--
-- =====================================================================
-- Anlass
-- =====================================================================
-- Das Technische Merkblatt verlangt in Kap. 5 (TB-05,
-- `compliance/foerderauflagen/merkblatt-anforderungen.md`):
--
--   „Geraeteerkennungs-Quoten: 20/25/30/35/40 % des Jahresverbrauchs in
--    Projektjahr 1-5 zuordenbar; nicht kumulativ."
--
-- und als Umsetzung ausdruecklich „Nachweis-Reports je Projektjahr mit
-- Quoten-Berechnung; Zuordnungs-Metadaten je Verbrauchsanteil".
--
-- Gerechnet wird die Quote seit V0056/V0057 (`GeraeteerkennungService.quote`),
-- und die Betriebsoberflaeche zeigt sie. Im Exportbuendel an die
-- Bewilligungsbehoerde stand sie NICHT -- der Verwendungsnachweis konnte die
-- Erfuellung von TB-05 also gar nicht belegen. Er enthielt die Einsparung,
-- aber nicht die Zuordnung, auf der die Foerderfaehigkeit mit beruht.
--
-- =====================================================================
-- WARUM EINE NEUE VERSION UND KEIN ANHAENGEN
-- =====================================================================
-- Der Export ist bit-deterministisch: `nachweis.export_datei` haelt je Datei
-- einen Hash, und der Download RENDERT DIE DATEI NEU und vergleicht. Genau
-- das ist der Beleg, dass eine eingereichte Datei nicht nachtraeglich
-- gedriftet ist (ADR-0007 D5/B5).
--
-- Wuerde der Renderer ab sofort zwei Dateien MEHR erzeugen, aenderte sich das
-- Rendering auch fuer BEREITS EINGEREICHTE Exporte: ihr Manifest-Hash passte
-- nicht mehr, und die Verifikation schluege fehl. Ein eingereichter Nachweis
-- wuerde damit rueckwirkend „ungueltig", obwohl an ihm nichts falsch ist.
--
-- Deshalb SCD2 auf dem Verfahrenskatalog, exakt das in
-- `nachweis-export-spaltenprofil.const.ts` vorgesehene Muster („append-only,
-- neue version, nicht diese Datei aendern"): Version 1 wird geschlossen und
-- bleibt bestehen, Version 2 wird geoeffnet. Der Renderer waehlt anhand der
-- am Export GESPEICHERTEN `schema_version` -- Altexporte rendern weiter mit
-- V1 und verifizieren unveraendert.
--
-- =====================================================================
-- Die beiden Dateien
-- =====================================================================
--   geraeteerkennung_quote.csv  -- je (Endkunde, Energietraeger) EINE Zeile:
--       Gesamtverbrauch, zugeordneter Verbrauch, Quote, Sollquote des
--       Projektjahres, erreicht ja/nein, Zahl der Systeme und der als
--       entbehrlich vermerkten. Die Frage „wird die Quote erreicht?".
--   geraeteerkennung_gruppe.csv -- je Geraetegruppe EINE Zeile: zugeordneter
--       Verbrauch, Anteil, METHODE und GENAUIGKEIT. Die Frage „wie wurde
--       zugeordnet?" -- genau die „Zuordnungs-Metadaten je Verbrauchsanteil",
--       die Kap. 5 verlangt. Ohne sie waere eine gemessene Zuordnung von
--       einer geschaetzten nicht zu unterscheiden.
--
-- Eigene Kategorie `geraeteerkennung` statt Anhaengen an `einspardaten`: Die
-- Kategorien sind die DE-03-Gliederung des Empfaengers. Die Quote ist keine
-- Einspardatei -- sie beantwortet eine andere Auflage, und eine Datei unter
-- falscher Kategorie waere beim Empfaenger schwerer zu finden als eine
-- zusaetzliche Kategorie.
--
-- =====================================================================
-- Pseudonym-Typ `geraetegruppe`
-- =====================================================================
-- `energy.geraetegruppe.bezeichnung` ist FREITEXT. Fuer TB-05 wird er nicht
-- gebraucht (gefragt sind Quote, Methode, Genauigkeit) -- aber jemand kann
-- eine Gruppe nach einer Person benennen, und dann stuende ein Klarname in
-- einem sonst durchgehend pseudonymisierten Export.
--
-- Behandlung wie bei der Station (Auflage A13): Regelfall `GG-<lfd>` aus
-- `nachweis.export_pseudonym`, Klarname NUR bei
-- `nachweis.export.station_darstellung='klarname'`, das seinerseits eine
-- aktenkundige `anfrage_ref` erzwingt (DB-CHECK
-- `ck_export_station_klarname_anfrage`). Kein neuer Schalter, kein zweiter
-- Freigabeweg -- dieselbe Entscheidung deckt beide Freitextfelder ab.
--
-- KEINE Grant-Aenderung: `nachweis.export_pseudonym` ist bereits vollstaendig
-- der Rolle `edms_nachweis_renderer` vorbehalten (V0025); ein zusaetzlicher
-- `entitaet_typ`-Wert aendert daran nichts.

-- =====================================================================
-- (1) Kategorien und Dateinamen (A19: geschlossene, entitaetsfreie Liste)
-- =====================================================================

ALTER TABLE nachweis.export_datei
    DROP CONSTRAINT ck_export_datei_kategorie,
    DROP CONSTRAINT ck_export_datei_kategorie_dateiname;

ALTER TABLE nachweis.export_datei
    ADD CONSTRAINT ck_export_datei_kategorie CHECK (
        kategorie IN ('rohdaten', 'baseline', 'einflussgroessen', 'einspardaten', 'geraeteerkennung', 'meta')
    ),
    ADD CONSTRAINT ck_export_datei_kategorie_dateiname CHECK (
        (kategorie = 'rohdaten'          AND dateiname ~ '^rohdaten_messwert_tag\.(csv|xlsx)$')
     OR (kategorie = 'baseline'          AND dateiname ~ '^(baseline_lauf|baseline_klima_tag)\.(csv|xlsx)$')
     OR (kategorie = 'einflussgroessen'  AND dateiname ~ '^einflussgroessen_intervall\.(csv|xlsx)$')
     OR (kategorie = 'einspardaten'      AND dateiname ~ '^(einspardaten_monat|einspardaten_jahr|einspardaten_differenz)\.(csv|xlsx)$')
     OR (kategorie = 'geraeteerkennung'  AND dateiname ~ '^(geraeteerkennung_quote|geraeteerkennung_gruppe)\.(csv|xlsx)$')
     OR (kategorie = 'meta'              AND dateiname ~ '^(metablatt|manifest)\.(csv|xlsx)$')
    );

COMMENT ON CONSTRAINT ck_export_datei_kategorie_dateiname ON nachweis.export_datei IS
  'Auflage A19 (ADR-0007 Teil C): entitaetsfreie, geschlossene, kategoriebasierte Dateinamensliste -- verhindert strukturell, dass ein Pseudonym/eine Entitaets-ID jemals Bestandteil eines Dateinamens wird (sonst truege ein append-only Audit-Kontext-Key `dateiname` das Pseudonym unwiderruflich in die Kette, ADR-0007 B10). Basisnamen aus D5-Tabelle; einspardaten_differenz ist eine database-lead-Ergaenzung fuer den B7-Differenz-Report. Kategorie geraeteerkennung seit V0064 (Exportschema v2, TB-05 Quotennachweis).';

-- =====================================================================
-- (2) Pseudonym-Typ fuer die Geraetegruppen-Bezeichnung
-- =====================================================================

ALTER TABLE nachweis.export_pseudonym
    DROP CONSTRAINT ck_export_pseudonym_entitaet_typ;

ALTER TABLE nachweis.export_pseudonym
    ADD CONSTRAINT ck_export_pseudonym_entitaet_typ CHECK (
        entitaet_typ IN ('endkunde', 'system', 'messkanal', 'station', 'geraetegruppe')
    );

-- =====================================================================
-- (3) SCD2 auf dem Verfahrenskatalog: v1 schliessen, v2 oeffnen
-- =====================================================================
-- LAST-BEARING ANNAHME (wie V0009/V0032/V0062): `now()` ist innerhalb EINER
-- Transaktion stabil (Transaktions-Startzeit) -- UPDATE und INSERT laufen in
-- EINER Transaktion (Standardverhalten des Migrations-Runners je Datei). Nur
-- so gilt exakt `alte_version.gueltig_bis = neue_version.gueltig_ab`, und der
-- EXCLUDE-Constraint `ex_verfahren_version_no_overlap` akzeptiert die neue
-- Zeile ueberhaupt erst. Die Down-Datei nutzt dieselbe Gleichheit, um die
-- neue Version zu erkennen.

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

    IF v_alt.version <> 1 THEN
        RAISE EXCEPTION 'analytics: offene Version von % ist %, erwartet 1 -- Migration abgebrochen (bereits angewendet oder Katalog seither veraendert?).', v_code, v_alt.version;
    END IF;

    UPDATE analytics.verfahren_version
       SET gueltig_bis = now()
     WHERE id = v_alt.id;

    INSERT INTO analytics.verfahren_version
        (id, code, version, parameter_schema, golden_vectors, beschreibung, aktiv, gueltig_ab)
    VALUES (
        gen_random_uuid(), v_code, 2,
        $params$
        {
          "$schema": "https://json-schema.org/draft/2020-12/schema",
          "$id": "urn:edms:nachweis:verfahren:nachweis_export_kanonisch:2",
          "type": "object",
          "additionalProperties": false,
          "required": ["format_optionen", "kategorien"],
          "properties": {
            "format_optionen": {"type": "array", "items": {"type": "string", "enum": ["csv", "csv+xlsx"]},
              "default": ["csv", "csv+xlsx"],
              "beschreibung": "D5: kanonischer CSV-Satz ist IMMER die Nachweisgrundlage; XLSX ist optionale, nicht-bit-stabile Empfaenger-Beilage aus demselben Renderer."},
            "kategorien": {"type": "array", "items": {"type": "string",
                "enum": ["rohdaten", "baseline", "einflussgroessen", "einspardaten", "geraeteerkennung", "meta"]},
              "const": ["rohdaten", "baseline", "einflussgroessen", "einspardaten", "geraeteerkennung", "meta"],
              "beschreibung": "DE-03-Kategorien (D5-Tabelle) plus geraeteerkennung (TB-05), deckungsgleich mit dem DB-CHECK auf nachweis.export_datei.kategorie."},
            "spaltenprofil": {"type": "null", "const": null,
              "status": "weiterhin NICHT Teil dieser Migration -- O-B8 offen",
              "beschreibung": "Unveraendert gegenueber v1: Das spaltenscharfe Positivlisten-Profil je Datei haengt an der noch offenen CSV-Konvention O-B8 (Encoding, Trennzeichen, Dezimaltrenner). Diese Migration ERFINDET es NICHT -- sie erweitert nur die Kategorien- und Dateimenge. Das Profil in nachweis-export-spaltenprofil.const.ts bleibt der v1-Vorschlag in Code-Form und ist weiterhin bestaetigungsbeduerftig."}
          }
        }
        $params$::jsonb,
        '[]'::jsonb,
        'Kanonisches Export-Dateibuendel je Einspar-Lauf, Version 2 (V0064). Gegenueber v1 UNVERAENDERT in allen bestehenden Dateien -- ergaenzt ausschliesslich die Kategorie geraeteerkennung mit geraeteerkennung_quote.csv (Quote je Endkunde/Energietraeger gegen die Sollquote des Projektjahres) und geraeteerkennung_gruppe.csv (Zuordnung je Geraetegruppe samt Methode und Genauigkeit). Grund: Das Buendel konnte die Erfuellung von TB-05 ([Q3] Kap. 5, 20/25/30/35/40 % je Projektjahr, nicht kumulativ) nicht belegen -- die Quote war gerechnet und in der Oberflaeche sichtbar, erreichte den Nachweis aber nicht. Neue Version statt Anhang, weil der Download bestehende Exporte NEU RENDERT und gegen ihren Hash prueft: zwei zusaetzliche Dateien haetten jeden bereits eingereichten Export rueckwirkend als gedriftet erscheinen lassen. Die Geraetegruppen-Bezeichnung ist Freitext und wird wie die Station behandelt (A13): pseudonymisiert als GG-<lfd>, Klarname nur bei station_darstellung=klarname mit aktenkundiger anfrage_ref.',
        true, now());
END
$$;

-- =====================================================================
-- BOOTSTRAP-AUSNAHME (wie bei jeder Katalog-Migration, s.
-- V0006/V0007/V0009/V0015/V0021/V0026/V0032/V0062-Kopf)
-- =====================================================================
-- Diese Migration emittiert KEINE eigene `audit.katalog.geaendert`-Zeile. Der
-- tragende Grund ist unveraendert mechanisch: ein SQL-Migrationsskript kann
-- keinen validierten `actor_*`-Principal herstellen -- eine Selbst-Emission
-- muesste einen Akteur erfinden, genau das, was das Audit-Log ausschliesst.
-- Der Eintrag ist damit NICHT erledigt, sondern VERSCHOBEN: als operativer
-- Schritt mit echtem Principal nachzutragen, spaetestens bei Oeffnung des
-- ADR-0004-Gates.
