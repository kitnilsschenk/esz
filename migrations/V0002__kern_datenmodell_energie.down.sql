-- V0002__kern_datenmodell_energie.down.sql
--
-- Rollt das Kern-Datenmodell Energie (ADR-0004) vollständig zurück.
-- Greenfield-Migration (kein Bestandsschema, keine Produktions-/Bestands-
-- daten zum Zeitpunkt der Einführung, ADR §18 "Breaking Changes: keine") --
-- ein `DROP SCHEMA ... CASCADE` ist hier vertretbar, weil:
--   (a) alle drei Schemas (`identity`, `energy`, `measurement`) und alle
--       darin enthaltenen Objekte (Tabellen, Trigger, Funktionen, Indizes,
--       Constraints, das Hypertable inkl. seiner Chunks) AUSSCHLIESSLICH
--       von dieser Migration (V0002) angelegt wurden -- kein Fremd-Objekt
--       eines anderen Features liegt in diesen Namensräumen;
--   (b) keine cross-schema-Hart-FKs bestehen (rote Linie 1/5), sodass die
--       Reihenfolge zwischen den drei Schemas beim Drop irrelevant ist --
--       trotzdem in umgekehrter Anlage-Reihenfolge zur besseren
--       Nachvollziehbarkeit (measurement -> energy -> identity);
--   (c) die Extensions (timescaledb, btree_gist) NICHT hier, sondern in
--       V0001 verwaltet werden -- dieser Rollback fasst sie bewusst nicht an.
--
-- `energy.zaehler.geraete_referenz` wurde in V0002 bewusst NICHT angelegt
-- (siehe Datei-Kopf von V0002, Abweichung (a)) -- es gibt daher hier nichts
-- zusätzlich zurückzurollen.
--
-- Hinweis Hypertable: `DROP SCHEMA measurement CASCADE` entfernt
-- `measurement.messwert` inkl. aller TimescaleDB-Chunks (Timescale räumt
-- die zugehörigen `_timescaledb_internal`-Chunk-Tabellen beim Drop der
-- Hypertable automatisch mit auf) -- kein manuelles `drop_chunks()` nötig.
--
-- ACHTUNG (nur relevant, falls diese Migration NICHT auf einer frischen
-- Dev-/Test-Instanz zurückgerollt wird): Da dies eine Greenfield-Migration
-- ohne Produktivdaten ist, verlangt .claude/rules/database-migrations.md
-- ("Keine DROP TABLE auf produktive Tabellen ... ohne Rollback-/Backup-
-- Nachweis, User-Freigabe zwingend") HIER keinen gesonderten
-- Backup-Nachweis. Sollte diese Migration wider Erwarten bereits auf einer
-- Instanz MIT echten (auch synthetischen Pilot-)Daten angewendet worden
-- sein, ist vor dem Ausführen dieses Rollbacks ein Backup zu ziehen und die
-- User-Freigabe einzuholen (devops-lead-Abstimmung).

DROP SCHEMA measurement CASCADE;
DROP SCHEMA energy CASCADE;
DROP SCHEMA identity CASCADE;
