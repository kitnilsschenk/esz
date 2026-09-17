-- V0081__einfluss_befund_select_spaltenscharf.down.sql
--
-- Zurueck auf das volle Tabellen-SELECT aus V0079 (D-GRANT-ERW (a)) -- nicht
-- auf irgendeine andere Rechte-Lage. Ein Rueckbau, der etwas anderes
-- hinterlaesst als den Zustand davor, macht die Kette der GRANTs
-- unnachvollziehbar.

REVOKE SELECT (id) ON einfluss.befund FROM edms_einfluss_erkennung;
GRANT SELECT ON einfluss.befund TO edms_einfluss_erkennung;
