-- V0030__preflight_katalog_fj10_fj11_ergaenzung.down.sql
--
-- Rollback: Version 2 loeschen, Version 1 wieder als aktiv/offen markieren.
--
-- HINWEIS (Bestandsschutz): dieser Rollback ist NUR sicher, solange KEIN
-- `nachweis.preflight` mit `profil_version=2` existiert (Referenz wuerde
-- sonst ins Leere zeigen). In einer produktiven Umgebung mit bereits
-- erzeugten Version-2-Preflights ist dieser DOWN-Pfad NICHT anwendbar --
-- identisches Prinzip zu jeder anderen SCD2-Historien-Migration in diesem
-- Repo (append-only, kein rueckwirkendes Loeschen referenzierter Historie).

DELETE FROM analytics.verfahren_version
 WHERE code = 'foerderjahr_preflight_de02' AND version = 2;

UPDATE analytics.verfahren_version
   SET aktiv = true,
       gueltig_bis = NULL
 WHERE code = 'foerderjahr_preflight_de02' AND version = 1;
