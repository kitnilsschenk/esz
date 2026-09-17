-- V0028__messkonzept_version_energietraeger_system_zuordnung.down.sql
--
-- Rollt Schritt für Schritt in UMGEKEHRTER Reihenfolge zur Up-Datei zurück.
-- Reihenfolge ist ZWINGEND: die Zuordnungstabelle referenziert die in
-- Schritt (0)/(1) der Up-Datei ergänzten UNIQUE-Constraints — werden diese
-- vor der Zuordnungstabelle entfernt, bricht Postgres mit "cannot drop
-- constraint ... because other objects depend on it" ab (verifiziert im
-- Wegwerf-Testcontainer, s. Migrations-Auftrag).
--
-- (a) DROP TABLE der Zuordnungstabelle: nimmt PK, beide zusammengesetzten
--     FKs, den Index (3) und beide Kommentare (4) automatisch mit — keine
--     gesonderten Anweisungen nötig.
-- (b) ALTER TABLE energy.system DROP CONSTRAINT: nach (a) referenziert
--     nichts mehr diese UNIQUE-Constraint — direktes DROP ohne CASCADE.
-- (c) ALTER TABLE energy.messkonzept_version_energietraeger DROP COLUMN
--     endkunde_id: entfernt automatisch die davon abhängigen
--     Constraints ux_mvet_id_endkunde (UNIQUE) und fk_mvet_endkunde (FK
--     nach energy.endkunde) sowie den Spalten-Kommentar mit — identisches
--     Postgres-Verhalten wie bei den CHECK-Constraint-Rollbacks in
--     V0005/V0027 (kein separates DROP CONSTRAINT nötig, weil nach
--     Schritt (a) kein FREMDES Objekt mehr von diesen lokalen
--     Constraints abhängt).
--
-- .claude/rules/database-migrations.md verlangt hier KEINEN Backup-/
-- Freigabe-Nachweis: (a) betrifft eine in V0028 selbst neu angelegte
-- Tabelle (kein Bestandsschema), (b)/(c) sind additive Nachträge aus
-- V0028 auf Bestandstabellen, kein `DROP TABLE` auf eine produktive
-- Tabelle. Datenverlust bei (c): bereits befüllte
-- `endkunde_id`-Redundanzwerte auf mvet gehen verloren — auf einer
-- Dev-/Test-Instanz unkritisch (identisch rekonstruierbar über den
-- 3-Hop-Pfad, s. Up-Datei Schritt (0), sollte diese Migration je erneut
-- angewendet werden).

DROP TABLE energy.messkonzept_version_energietraeger_system;

ALTER TABLE energy.system
    DROP CONSTRAINT ux_system_id_endkunde;

ALTER TABLE energy.messkonzept_version_energietraeger
    DROP COLUMN endkunde_id;
