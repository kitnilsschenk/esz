-- Down zu V0052 (Widerspruch, AW-27).
--
-- ACHTUNG, DATENVERLUST MIT RECHTLICHER WIRKUNG:
--
-- `consent.widerspruch` ist der EINZIGE Nachweis darueber, wer wann auf
-- welchem Weg einer Verarbeitung widersprochen hat. Das Attribut
-- `von_wiss_auswertung_ausgenommen` bleibt beim Rueckbau zwar stehen und
-- wirkt weiter — aber es sagt nur noch DASS, nicht mehr WER, WANN und
-- WORAUFHIN. Fuer eine Auskunft nach Art. 15 und fuer die Rechenschaft nach
-- Art. 5 Abs. 2 ist das der Unterschied zwischen Beleg und Behauptung.
--
-- Schlimmer trifft es die Nutzerinformation: Ein Widerspruch gegen die
-- monatliche Zusendung hat KEIN Attribut, das ihn ueberlebt. Er ist nach
-- diesem Skript vollstaendig fort, und die Zusendung liefe wieder an.
--
-- VOR DEM RUECKBAU ZWINGEND PRUEFEN UND EXPORTIEREN:
--
--   SELECT subjekt_typ, zweck_code, count(*) FILTER (WHERE zurueckgenommen_at IS NULL) AS wirksam,
--          count(*) AS gesamt
--     FROM consent.widerspruch
--    GROUP BY subjekt_typ, zweck_code;
--
-- Ist `wirksam` groesser als null, braucht der Rueckbau die ausdrueckliche
-- Freigabe des Users, einen dokumentierten Export der Zeilen und eine
-- Festlegung, wie die betroffenen Erklaerungen danach beachtet werden
-- (`.claude/rules/database-migrations.md`).
--
-- Die Spalte am Anschlussnutzer faellt mit zurueck. Sie hat heute keine
-- Wirkung (der Zweig ist fail-closed gesperrt); wurde die Sperre inzwischen
-- aufgehoben, ist der Bestand vorher zu sichern:
--
--   SELECT id FROM energy.anschlussnutzer WHERE von_wiss_auswertung_ausgenommen;

REVOKE SELECT, INSERT, UPDATE ON consent.widerspruch FROM edms_app;

ALTER TABLE energy.anschlussnutzer DROP COLUMN von_wiss_auswertung_ausgenommen;

DROP TRIGGER trg_widerspruch_updated_at ON consent.widerspruch;
DROP INDEX consent.ix_widerspruch_anschlussnutzer;
DROP INDEX consent.ix_widerspruch_endkunde;
DROP INDEX consent.ux_widerspruch_wirksam_anschlussnutzer;
DROP INDEX consent.ux_widerspruch_wirksam_endkunde;
DROP TABLE consent.widerspruch;

ALTER TABLE consent.zweck_subjekt DROP CONSTRAINT ux_zweck_subjekt_modus;
