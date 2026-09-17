-- V0082__audit_tb03_erkennung_event_wrapper.down.sql
--
-- Reiner Dokumentations-Rueckbau. Kein Verhalten, kein Schema, keine Rechte
-- betroffen -- die Kommentare verschwinden, die Funktionen und Spalten
-- bleiben.
--
-- `COMMENT ... IS NULL` ist der vorgesehene Weg, einen Kommentar zu
-- entfernen; ein DROP gibt es fuer Kommentare nicht.

COMMENT ON COLUMN einfluss.befund.zeitraum_bis IS NULL;

COMMENT ON FUNCTION audit.append_tb03_ueberschreitung_event(uuid, uuid, text, text, date, date, text, boolean) IS NULL;
COMMENT ON FUNCTION audit.append_tb03_einsicht_event(integer, boolean) IS NULL;
