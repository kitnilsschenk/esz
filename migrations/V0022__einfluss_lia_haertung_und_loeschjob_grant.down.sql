-- V0022__einfluss_lia_haertung_und_loeschjob_grant.down.sql
--
-- Rollt P2 (LIA-CHECK-Haertung) und die O-B9-Vorbereitung (DELETE-Grant)
-- zurueck. Reihenfolge umgekehrt zur Up-Datei.
--
-- ACHTUNG: falls `einfluss.intervall` zwischenzeitlich (nach Merge einer
-- kuenftigen CRUD-Anbindung, ADR-0006 C4/P3) befuellt wurde, ist
-- DROP CONSTRAINT unschaedlich fuer den Bestand -- es macht nur die zuvor
-- verbotene Kombination betroffener_typ=endkunde + rechtsgrundlage=art6_1f
-- wieder zulaessig, loescht/aendert KEINE Zeilen. Kein Backup-Nachweis
-- noetig (.claude/rules/database-migrations.md: nur DROP TABLE ist
-- freigabepflichtig). REVOKE DELETE ist ebenfalls schadlos -- setzt nur ein
-- zuvor nicht vorhandenes Privileg zurueck; falls der O-B9-Loesch-Job
-- (Ops-Scope, ausserhalb dieser Migration) inzwischen live ist, WUERDE
-- dieser Rollback ihn brechen (edms_einfluss verliert DELETE) -- vor einem
-- Rollback auf einer Umgebung mit aktivem Loesch-Job zwingend devops-lead/
-- retention-engineer konsultieren.

REVOKE DELETE ON einfluss.intervall, einfluss.befund FROM edms_einfluss;

ALTER TABLE einfluss.intervall DROP CONSTRAINT ck_intervall_endkunde_art6_1b;
