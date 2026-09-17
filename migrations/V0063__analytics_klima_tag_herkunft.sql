-- V0063__analytics_klima_tag_herkunft.sql
--
-- Ergaenzt `analytics.klima_tag` um die Herkunftsangaben, die ein realer
-- DWD-Abruf mitbringt: Dateiversion, Lizenzkennung, DWD-Qualitaetsniveau.
--
-- =====================================================================
-- Anlass
-- =====================================================================
-- Bis hierher gab es nur EINEN Klima-Adapter (`SyntheticKlimaQuelleAdapter`,
-- `quelle='synthetic_dev'`), und fuer gerechnete Zahlen aus einer Formel ist
-- `station_ref`/`tag`/`revision`/`abgerufen_at` die vollstaendige Herkunft.
--
-- Mit dem realen Adapter (opendata.dwd.de, CDC, Bulk-Download) aendert sich
-- das. `.claude/rules/dependencies.md` ("Datenlizenzen") und
-- `docs/datenquellen.md` DQ-001 verlangen unter Auflage A-3 ausdruecklich, je
-- Abruf zu persistieren: Stations-ID, Zeitraum, Abrufzeitpunkt, DATEIVERSION
-- und LIZENZKENNUNG. Die ersten drei traegt die Tabelle bereits
-- (`station_ref`, `tag`, `abgerufen_at`), die letzten beiden nicht.
--
-- Das ist keine Formalie: der Quellenvermerk im BAFA-Export (Auflage A-2)
-- behauptet, die Werte stammten aus einer bestimmten CC-BY-Quelle. Steht in
-- der Zeile selbst nicht, AUS WELCHER Datei sie kam und unter WELCHER Lizenz,
-- ist diese Behauptung nachtraeglich nicht mehr belegbar -- und der Export
-- gegenueber der Bewilligungsbehoerde nicht reproduzierbar.
--
-- =====================================================================
-- Die drei Spalten
-- =====================================================================
--   datei_version     -- Dateiname des CDC-Archivs samt Zeitraum, z. B.
--                        'tageswerte_KL_00433_19310101_20251231_hist.zip'.
--                        Der Zeitraum im Namen IST die Version: DWD ersetzt
--                        die Datei bei jeder Aktualisierung unter neuem Namen.
--   lizenz_id         -- SPDX-naher Kurzschluessel, 'CC-BY-4.0' fuer DWD-CDC
--                        (Nutzungsbedingungen_German.pdf, Stand Mai 2024).
--   qualitaets_niveau -- DWD-Spalte QN_4 (Qualitaetsniveau der
--                        Temperaturwerte, 1..10). Fachlich der Grund, warum
--                        `revision` ueberhaupt existiert: `recent/` liefert
--                        vorlaeufige Werte (kleines QN), die spaeter im
--                        `historical/`-Archiv geprueft und ggf. KORRIGIERT
--                        erscheinen (QN 10). Ohne das Niveau ist einer
--                        Revision nicht anzusehen, ob sie eine Korrektur
--                        oder nur ein Neu-Abruf desselben Standes ist.
--
-- Alle drei NULLABLE, und zwar dauerhaft: fuer `quelle='synthetic_dev'` gibt
-- es weder eine Datei noch eine Lizenz noch ein DWD-Qualitaetsniveau. Ein
-- NOT NULL wuerde erzwingen, dort Werte zu ERFINDEN -- fuer die Lizenzspalte
-- waere das die gefaehrlichste Variante ueberhaupt (synthetische Werte als
-- CC-BY-Fremddaten auszuweisen ist sachlich falsch, s.
-- `SyntheticKlimaQuelleAdapter`-Doc: "eine Attribution waere hier sachlich
-- falsch").
--
-- Bestandszeilen bleiben deshalb bewusst OHNE Backfill: sie sind samt und
-- sonders synthetisch (`quelle='synthetic_dev'`), NULL ist fuer sie die
-- richtige und ehrliche Angabe.
--
-- =====================================================================
-- Was diese Migration NICHT tut
-- =====================================================================
-- Keine Aenderung an PK `(station_ref, tag, revision)`, keine Aenderung der
-- GRANTs (V0019 gibt `edms_app` nur INSERT/SELECT -- die append-only-Achse
-- bleibt genau so), kein CHECK auf `quelle` (die Wertemenge waechst mit
-- jedem kuenftigen Adapter; ein Katalog-CHECK muesste dann jedes Mal
-- migriert werden, ohne dass er etwas absichert, was die Anwendung nicht
-- ohnehin setzt).

ALTER TABLE analytics.klima_tag
    ADD COLUMN datei_version     text,
    ADD COLUMN lizenz_id         text,
    ADD COLUMN qualitaets_niveau smallint;

ALTER TABLE analytics.klima_tag
    ADD CONSTRAINT ck_klima_tag_qualitaets_niveau
        CHECK (qualitaets_niveau IS NULL OR qualitaets_niveau BETWEEN 0 AND 10);

COMMENT ON COLUMN analytics.klima_tag.quelle IS
    'Herkunftskennung des Adapters. ''synthetic_dev'' = deterministisch gerechnetes Dev/Test-Jahresprofil (KEINE Fremddaten, KEINE Attribution). ''dwd_cdc_kl_tag'' = Deutscher Wetterdienst, Climate Data Center, Tageswerte KL (opendata.dwd.de, Bulk-Download).';

COMMENT ON COLUMN analytics.klima_tag.datei_version IS
    'pii=false; Auflage A-3 (docs/datenquellen.md DQ-001): Dateiname des CDC-Archivs samt Zeitraum, aus dem dieser Wert stammt. NULL fuer synthetische Werte.';

COMMENT ON COLUMN analytics.klima_tag.lizenz_id IS
    'pii=false; Auflage A-3: Lizenzkennung der Fremddatenquelle, z. B. ''CC-BY-4.0''. NULL fuer synthetische Werte -- eine Lizenzangabe waere dort sachlich falsch.';

COMMENT ON COLUMN analytics.klima_tag.qualitaets_niveau IS
    'pii=false; DWD-Spalte QN_4 (1..10) des Temperaturwerts. NULL fuer synthetische Werte. Traegt die Unterscheidung "vorlaeufig (recent) vs. geprueft (historical)", auf der die revision-Achse beruht.';
