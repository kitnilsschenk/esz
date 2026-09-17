-- V0023__analytics_berechnungslauf_endkunde_sperre_trigger.down.sql
--
-- Rollt den P4-Backstop-Trigger (fail-closed A10-Zweitpfad) vollstaendig
-- zurueck. Reihenfolge umgekehrt zur Up-Datei: Trigger -> Funktion ->
-- additives energy-Grant.
--
-- ACHTUNG (nur relevant bei bereits produktiv aktivem Trigger): nach diesem
-- Rollback verliert `analytics.berechnungslauf` den DB-seitigen Backstop --
-- der App-Scope-Check in `BerechnungslaufService.starten()` bleibt davon
-- UNBERUEHRT (eigenstaendiger, unabhaengiger Pfad) und schuetzt weiterhin
-- den regulaeren Schreibpfad. Kein DROP TABLE, kein Datenverlust -- kein
-- gesonderter Backup-Nachweis noetig (.claude/rules/database-migrations.md).

DROP TRIGGER trg_berechnungslauf_endkunde_sperre ON analytics.berechnungslauf;

DROP FUNCTION analytics.pruefe_endkunde_sperre();

REVOKE SELECT (id, verarbeitungs_status) ON energy.endkunde FROM edms_analytics_owner;
REVOKE USAGE ON SCHEMA energy FROM edms_analytics_owner;
