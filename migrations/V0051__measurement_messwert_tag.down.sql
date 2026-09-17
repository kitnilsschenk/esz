-- Down zu V0051 (Tagesbestand, Stufe B).
--
-- ACHTUNG — WAS DIESER RUECKBAU BEDEUTET:
--
-- Solange KEIN `drop_chunks` auf `measurement.messwert` gelaufen ist, ist er
-- verlustfrei: Der Tagesbestand ist vollstaendig aus den 15-Minuten-Werten
-- reproduzierbar, der Lauf muss danach nur wiederholt werden.
--
-- Ist Stufe A dagegen bereits ausgefuehrt worden, sind die Rohwerte fort und
-- dieser Bestand ist der EINZIGE Nachweis in der Granularitaet, die DE-02/
-- TB-09 verlangen. Dann ist ein `DROP TABLE` hier eine unwiederbringliche
-- Vernichtung von Nachweisdaten.
--
-- VOR DEM RUECKBAU ZWINGEND PRUEFEN, ob Rohwerte fuer denselben Zeitraum
-- noch existieren:
--
--   SELECT t.messkanal_key, min(t.tag), max(t.tag), count(*) AS tage,
--          count(*) FILTER (
--            WHERE NOT EXISTS (
--              SELECT 1 FROM measurement.messwert m
--               WHERE m.messkanal_key = t.messkanal_key
--                 AND m.ts >= t.tag::timestamptz
--                 AND m.ts <  (t.tag + 1)::timestamptz
--            )
--          ) AS tage_ohne_rohwerte
--     FROM measurement.messwert_tag t
--    GROUP BY t.messkanal_key;
--
-- Ist `tage_ohne_rohwerte` groesser als null, ist der Rueckbau ein
-- Datenverlust und braucht die ausdrueckliche Freigabe des Users sowie einen
-- dokumentierten Backup-Nachweis (`.claude/rules/database-migrations.md`).

REVOKE USAGE  ON SCHEMA measurement       FROM edms_retention;
REVOKE SELECT ON measurement.messwert_tag FROM edms_retention;
REVOKE SELECT, INSERT, UPDATE ON measurement.messwert_tag FROM edms_app;

DROP INDEX measurement.ix_messwert_tag_tag;
DROP TABLE measurement.messwert_tag;
