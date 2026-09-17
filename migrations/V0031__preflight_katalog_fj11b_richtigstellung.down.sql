-- V0031__preflight_katalog_fj11b_richtigstellung.down.sql
--
-- Rollback: Version 3 loeschen, Version 2 wieder als aktiv/offen markieren.
--
-- HINWEIS (Bestandsschutz): nur sicher, solange KEIN `nachweis.preflight` mit
-- `profil_version=3` existiert -- eine solche Referenz zeigte sonst ins Leere.
-- Identisches Prinzip wie im V0030-Rollback (append-only, kein rueckwirkendes
-- Loeschen referenzierter Historie).
--
-- Fachlicher Hinweis: dieser Rollback stellt den SACHLICH FALSCHEN FJ-11b-Text
-- aus Version 2 wieder als aktiv her. Er ist ein technischer Ruecknahmepfad,
-- keine fachlich wuenschenswerte Zielstellung.

DELETE FROM analytics.verfahren_version
 WHERE code = 'foerderjahr_preflight_de02' AND version = 3;

UPDATE analytics.verfahren_version
   SET aktiv = true,
       gueltig_bis = NULL
 WHERE code = 'foerderjahr_preflight_de02' AND version = 2;
