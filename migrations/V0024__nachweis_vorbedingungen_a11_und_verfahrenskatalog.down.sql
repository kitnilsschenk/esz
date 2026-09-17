-- V0024__nachweis_vorbedingungen_a11_und_verfahrenskatalog.down.sql
--
-- Rollt die Vorbedingungen fuer das `nachweis`-Schema vollstaendig zurueck:
-- (2) die drei neuen Verfahrenskatalog-Zeilen (+ CHECK-Ruecknahme), dann
-- (1) das A11-Schema-Delta auf energy.endkunde/anschlussnutzer.
--
-- ACHTUNG (Reihenfolge zwingend): schlaegt fehl, falls V0025 (`nachweis`-
-- Schema) bereits angewendet ist -- dessen Fremdschluessel referenzieren
-- die hier geloeschten Katalog-Zeilen (nachweis.einsparlauf.verfahren_code/
-- _version, nachweis.preflight.profil_code/_version, nachweis.export.
-- schema_code/_version). V0025 zuerst zurueckrollen.
--
-- Greenfield-Migration (ADR-0007 Status "proposed", kein Produktivbetrieb)
-- -- kein gesonderter Backup-Nachweis noetig, sofern ausschliesslich gegen
-- eine Dev-/Test-/Wegwerf-Instanz gefahren. Wurden bereits echte
-- (auch nur synthetische Pilot-)Daten mit einschraenkung_grund_code/
-- gesperrt_seit befuellt, ist vor diesem Rollback ein Backup zu ziehen und
-- die User-Freigabe einzuholen (.claude/rules/database-migrations.md).

-- =====================================================================
-- (2) Verfahrenskatalog: drei Zeilen + CHECK-Ruecknahme
-- =====================================================================

DELETE FROM analytics.verfahren_version
 WHERE code IN ('einsparung_foerderjahr_kap91', 'foerderjahr_preflight_de02', 'nachweis_export_kanonisch');

DELETE FROM analytics.verfahren
 WHERE code IN ('einsparung_foerderjahr_kap91', 'foerderjahr_preflight_de02', 'nachweis_export_kanonisch');

ALTER TABLE analytics.verfahren DROP CONSTRAINT ck_verfahren_art;
ALTER TABLE analytics.verfahren ADD CONSTRAINT ck_verfahren_art CHECK (art IN ('bereinigung', 'baseline'));

-- =====================================================================
-- (1) A11-Schema-Delta
-- =====================================================================
-- DROP COLUMN entfernt die davon abhaengigen CHECK-Constraints automatisch
-- (PostgreSQL loest CHECK-Abhaengigkeiten auf betroffene Spalten auf) --
-- explizite DROP CONSTRAINT trotzdem zuerst, fuer Lesbarkeit/Eindeutigkeit
-- und um bei einer kuenftigen Constraint-Umbenennung nicht auf dieses
-- implizite Verhalten angewiesen zu sein.

ALTER TABLE energy.endkunde
    DROP CONSTRAINT IF EXISTS ck_endkunde_einschraenkung_kohaerenz,
    DROP CONSTRAINT IF EXISTS ck_endkunde_einschraenkung_grund_code;
ALTER TABLE energy.endkunde
    DROP COLUMN einschraenkung_grund_code,
    DROP COLUMN gesperrt_seit;

ALTER TABLE energy.anschlussnutzer
    DROP CONSTRAINT IF EXISTS ck_anschlussnutzer_einschraenkung_kohaerenz,
    DROP CONSTRAINT IF EXISTS ck_anschlussnutzer_einschraenkung_grund_code;
ALTER TABLE energy.anschlussnutzer
    DROP COLUMN einschraenkung_grund_code,
    DROP COLUMN gesperrt_seit;
