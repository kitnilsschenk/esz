-- V0013__messwert_rang_und_korrektur_log.down.sql
--
-- Rollt measurement.rang(), measurement.messwert_korrektur_log (+ Trigger)
-- sowie die in V0013 vergebenen/entzogenen Rechte auf measurement.messwert
-- vollstaendig zurueck.
--
-- ANDERS ALS V0002/V0003/V0008/V0010/V0011/V0012: diese Migration legt
-- KEIN eigenes Schema und KEINE eigene, isoliert droppbare Tabelle an, die
-- alle ihre Aenderungen per CASCADE mitreisst -- sie ERGAENZT stattdessen
-- Objekte AUF/AN der bereits von V0002 verwalteten Tabelle measurement.
-- messwert (Trigger, REVOKE/GRANT). Diese Ergaenzungen muessen daher
-- EXPLIZIT, in umgekehrter Anlage-Reihenfolge, zurueckgenommen werden --
-- ein einzelnes `DROP SCHEMA ... CASCADE` waere hier unangebracht (es
-- wuerde measurement.messwert selbst treffen, das V0002 gehoert).
--
-- Reihenfolge: (1) Trigger auf measurement.messwert entfernen (haengt von
-- der Trigger-Funktion ab) -> (2) Trigger-Funktion droppen -> (3) Tabelle
-- messwert_korrektur_log droppen (reisst ihren Index/CHECK/REVOKE/GRANT
-- automatisch mit) -> (4) rang()-Funktion droppen -> (5) in V0013
-- vergebene Rechte auf measurement.messwert fuer edms_ingest_worker
-- zurueeknehmen -> (6) Hinweis zum PUBLIC-REVOKE (bewusst NICHT
-- rueckgaengig gemacht, s. u.).

-- =====================================================================
-- (1)+(2) Trigger + Trigger-Funktion
-- =====================================================================
DROP TRIGGER trg_messwert_korrektur_log ON measurement.messwert;
DROP FUNCTION measurement.messwert_korrektur_log_schreiben();

-- =====================================================================
-- (3) Korrekturhistorien-Tabelle
-- =====================================================================
-- Entfernt messwert_korrektur_log inkl. ihres Index (ix_messwert_
-- korrektur_log_kanal_ts), ihres REVOKE-Zustands und des INSERT-Grants an
-- edms_ingest_worker -- alles an die Tabelle gebunden, kein separates
-- DROP je Objekt noetig (analog V0008-Down-Datei-Reasoning).
--
-- ACHTUNG (nur relevant, falls dieser Rollback NICHT auf einer frischen
-- Dev-/Test-Instanz erfolgt): Greenfield-Migration ohne Produktivdaten ->
-- .claude/rules/database-migrations.md verlangt HIER keinen gesonderten
-- Backup-Nachweis. Da das Ingest-Gate durchgehend geschlossen war (s.
-- Up-Datei-Kopf), koennen in dieser Tabelle -- selbst wenn diese Migration
-- bereits angewendet wurde -- KEINE echten Korrektur-Ereignisse entstanden
-- sein. Wurde dennoch bereits auf einer Instanz MIT synthetischen
-- Pilot-Korrekturdaten angewendet, gilt trotzdem: Backup + User-Freigabe
-- vor diesem Rollback (devops-lead-Abstimmung, analog vorheriger
-- Down-Dateien dieses Batches).
DROP TABLE measurement.messwert_korrektur_log;

-- =====================================================================
-- (4) rang()-Funktion
-- =====================================================================
DROP FUNCTION measurement.rang(smallint, smallint);

-- =====================================================================
-- (5) In V0013 vergebene Rechte auf measurement.messwert zurueeknehmen
-- =====================================================================
-- Vor V0013 hatte edms_ingest_worker KEINERLEI Zugriff auf das Schema
-- `measurement` (weder USAGE noch SELECT/INSERT/UPDATE auf messwert) --
-- dieser Rollback stellt exakt diesen Vor-V0013-Zustand wieder her.
REVOKE SELECT, INSERT, UPDATE ON measurement.messwert FROM edms_ingest_worker;
REVOKE USAGE ON SCHEMA measurement FROM edms_ingest_worker;

-- =====================================================================
-- (6) PUBLIC-REVOKE (TS-6) -- bewusst NICHT rueckgaengig gemacht
-- =====================================================================
-- `REVOKE DELETE, UPDATE ON measurement.messwert FROM PUBLIC` (Up-Datei)
-- war bereits beim Anwenden ein No-Op (PostgreSQL vergibt PUBLIC
-- standardmaessig KEINE Tabellen-Rechte, s. Up-Datei-Kommentar) -- es gibt
-- daher nichts "zurueckzugeben": ein `GRANT DELETE, UPDATE ... TO PUBLIC`
-- an dieser Stelle wuerde einen Zustand HERSTELLEN, der VOR V0013 ebenso
-- wenig bestand wie danach, und waere damit kein korrekter Rollback,
-- sondern eine neue, WENIGER sichere Rechte-Vergabe. Diese Datei laesst
-- den PUBLIC-Rechte-Zustand auf measurement.messwert daher unangetastet.
--
-- Rolle edms_ingest_worker selbst (aus V0010) wird hier NICHT gedroppt --
-- sie gehoert V0010, nicht dieser Migration (s. V0010-Down-Datei, Punkt 3).
