-- Down zu V0054 (monatliche Nutzerinformation, TB-06).
--
-- ACHTUNG: `nutzerinfo.information` traegt den VERSAND-/BEREITSTELLUNGS-
-- NACHWEIS, den TB-06 ausdruecklich verlangt. Er belegt, dass ein Endkunde
-- monatlich informiert wurde — und sein Fehlen ist gegenueber der
-- Bewilligungsbehoerde ein Auflagenverstoss, kein technisches Detail.
--
-- VOR DEM RUECKBAU ZWINGEND PRUEFEN UND EXPORTIEREN:
--
--   SELECT monat, count(*) AS erzeugt,
--          count(*) FILTER (WHERE zugestellt_at IS NOT NULL) AS zugestellt
--     FROM nutzerinfo.information
--    GROUP BY monat ORDER BY monat;
--
-- Ist `zugestellt` groesser als null, vernichtet dieses Skript den Nachweis
-- ueber bereits erfuellte Monate. Das braucht die ausdrueckliche Freigabe des
-- Users und einen dokumentierten Export
-- (`.claude/rules/database-migrations.md`).

REVOKE SELECT ON nutzerinfo.information FROM edms_retention;
REVOKE USAGE  ON SCHEMA nutzerinfo       FROM edms_retention;
REVOKE SELECT, INSERT, UPDATE ON nutzerinfo.information FROM edms_app;
REVOKE USAGE  ON SCHEMA nutzerinfo       FROM edms_app;

DROP INDEX nutzerinfo.ix_information_unzugestellt;
DROP INDEX nutzerinfo.ix_information_monat;
DROP TABLE nutzerinfo.information;
DROP SCHEMA nutzerinfo;
