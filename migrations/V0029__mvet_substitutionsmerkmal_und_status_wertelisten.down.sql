-- (4) rueckgaengig: identity-pii_status-Wertelisten (Nachtrag 2026-08-26)
ALTER TABLE identity.standort_pii DROP CONSTRAINT ck_standort_pii_status;
ALTER TABLE identity.anschlussnutzer_pii DROP CONSTRAINT ck_anschlussnutzer_pii_status;
ALTER TABLE identity.endkunde_pii DROP CONSTRAINT ck_endkunde_pii_status;

-- (3) rueckgaengig: Endkunde-Werteliste (Nachtrag 2026-08-26)
ALTER TABLE energy.endkunde
    DROP CONSTRAINT ck_endkunde_verarbeitungs_status;

-- V0029__mvet_substitutionsmerkmal_und_anschlussnutzer_statusliste.down.sql
--
-- Rollt in UMGEKEHRTER Reihenfolge zur Up-Datei zurueck. Beide Aenderungen
-- sind voneinander unabhaengig (kein FK/Constraint zwischen Teil 1 und
-- Teil 2) -- die Reihenfolge ist hier NICHT zwingend wie bei V0028, wird
-- aber aus Konsistenz zum House-Style trotzdem spiegelbildlich gehalten.
--
-- (a) ALTER TABLE energy.anschlussnutzer DROP CONSTRAINT: entfernt
--     ck_anschlussnutzer_verarbeitungs_status und den Spalten-Kommentar
--     bleibt NICHT automatisch erhalten -- COMMENT ON COLUMN wird separat
--     zurueckgesetzt (COMMENT IS NULL), sonst bliebe nach einem Down/Up-
--     Zyklus ein Kommentar stehen, der auf einen dann nicht mehr
--     existierenden CHECK verweist.
-- (b) ALTER TABLE energy.messkonzept_version_energietraeger DROP COLUMN:
--     entfernt automatisch den davon abhaengigen Spalten-Kommentar mit
--     (identisches Postgres-Verhalten wie V0028 Schritt (c)) -- kein
--     separates COMMENT-Reset noetig.
--
-- .claude/rules/database-migrations.md verlangt hier KEINEN Backup-/
-- Freigabe-Nachweis: (a) ist ein additiver CHECK-Nachtrag auf einer
-- Bestandstabelle (kein DROP TABLE), (b) eine additive Spalte auf einer
-- Bestandstabelle (kein DROP TABLE). Datenverlust bei (b): bereits gesetzte
-- `energietraeger_substitution=true`-Werte gehen verloren -- auf einer
-- Dev-/Test-Instanz unkritisch; in einer befuellten Umgebung waere das ein
-- ECHTER Datenverlust (die Betriebs-Team-Erfassung ist NICHT aus anderen
-- Spalten rekonstruierbar, anders als V0028s `endkunde_id`) -- vor einem
-- Down auf einer befuellten Instanz daher IMMER Backup-Nachweis einholen,
-- auch wenn diese Migration selbst kein `DROP TABLE` verwendet.

ALTER TABLE energy.anschlussnutzer
    DROP CONSTRAINT ck_anschlussnutzer_verarbeitungs_status;

COMMENT ON COLUMN energy.anschlussnutzer.verarbeitungs_status IS NULL;

ALTER TABLE energy.messkonzept_version_energietraeger
    DROP COLUMN energietraeger_substitution;
