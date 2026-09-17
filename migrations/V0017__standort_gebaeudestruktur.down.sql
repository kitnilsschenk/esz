-- V0017__standort_gebaeudestruktur.down.sql
--
-- Rollt ADR-0010 (Standort-/Gebaeudestruktur) vollstaendig zurueck.
-- ANDERS als V0002/V0003/V0010 (die JEWEILS ein KOMPLETT NEUES Schema
-- anlegen): diese Migration fuegt Objekte zu den BEREITS BESTEHENDEN
-- Schemas `energy` (seit V0002) und `identity` (seit V0002) hinzu -- ein
-- `DROP SCHEMA ... CASCADE` ist hier NICHT vertretbar, das wuerde
-- Fremd-Objekte anderer, laengst gemergter Migrationen mitreissen. Dieser
-- Rollback ist daher CHIRURGISCH: nur die drei in V0017 NEU angelegten
-- Tabellen + die eine neu angelegte Funktion, in Abhaengigkeitsreihenfolge.
--
-- Reihenfolge (umgekehrt zur Anlage, FK-Abhaengigkeiten beachten):
--   (1) identity.standort_pii -- keine Abhaengigkeiten (kein FK nach
--       energy, rote Linie 1/5) -- kann jederzeit zuerst weg.
--   (2) energy.zaehler_standort -- haengt per FK an energy.standort UND
--       energy.zaehler (letztere bleibt unangetastet) -- muss VOR
--       energy.standort weg.
--   (3) energy.standort -- DROP TABLE entfernt automatisch die BEIDEN
--       daran haengenden Trigger (trg_standort_pfad_pflegen,
--       trg_standort_updated_at) mit, OHNE dass diese hier einzeln
--       gedroppt werden muessen (Trigger sind Tabellen-Kindobjekte).
--   (4) energy.standort_pfad_pflegen() -- die freistehende Funktion selbst
--       kann erst NACH (3) weg (vorher wuerde sie noch vom Trigger auf
--       energy.standort referenziert -- "cannot drop function ... because
--       other objects depend on it").
--
-- ACHTUNG (nur relevant, falls dieser Rollback NICHT auf einer frischen
-- Dev-/Test-Instanz erfolgt): Greenfield-Migration ohne Produktivdaten
-- (ADR-0010 Status "proposed", User-Freigabe steht noch aus) --
-- .claude/rules/database-migrations.md verlangt HIER keinen gesonderten
-- Backup-Nachweis. Wurde diese Migration bereits auf einer Instanz MIT
-- echten (auch synthetischen Pilot-)Daten angewendet, ist vor diesem
-- Rollback ein Backup zu ziehen und die User-Freigabe einzuholen
-- (devops-lead-Abstimmung, analog V0002/V0003/V0008/V0010-Down-Dateien).

DROP TABLE identity.standort_pii;

DROP TABLE energy.zaehler_standort;

DROP TABLE energy.standort;

DROP FUNCTION energy.standort_pfad_pflegen();

-- Custom-GUC edms.standort_reparent_intern (s. Up-Datei, Pfad-Trigger-Kopf)
-- ist KEIN Datenbankobjekt (keine Zeile in pg_settings/keine CREATE-
-- Anweisung dieser Migration) -- es gibt hier nichts explizit
-- zurueckzurollen; die Einstellung existiert ohnehin nur transaktionslokal
-- waehrend eines Reparent-Vorgangs und verschwindet mit jeder Transaktion
-- von selbst.
