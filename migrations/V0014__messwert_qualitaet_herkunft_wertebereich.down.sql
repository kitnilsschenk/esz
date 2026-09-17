-- V0014__messwert_qualitaet_herkunft_wertebereich.down.sql
--
-- Rollt die beiden in V0014 hinzugefuegten CHECK-Constraints auf
-- measurement.messwert zurueck. Ausschliesslich von V0014 angelegte Objekte
-- (ck_messwert_qualitaet_wertebereich, ck_messwert_herkunft_wertebereich)
-- werden entfernt -- die Tabelle measurement.messwert selbst, ihre Spalten,
-- ihr Hypertable-Status und alle uebrigen Constraints/Indizes (V0002) bleiben
-- vollstaendig unangetastet.
--
-- `IF EXISTS` als Roundtrip-/Idempotenz-Absicherung (kein Fehler, falls der
-- Constraint aus einem teil-angewendeten Zustand bereits fehlt). Kein Backup-/
-- Freigabe-Nachweis noetig (.claude/rules/database-migrations.md): entfernt
-- nur Constraints, kein DROP TABLE, kein Datenverlust.

ALTER TABLE measurement.messwert
    DROP CONSTRAINT IF EXISTS ck_messwert_qualitaet_wertebereich,
    DROP CONSTRAINT IF EXISTS ck_messwert_herkunft_wertebereich;
