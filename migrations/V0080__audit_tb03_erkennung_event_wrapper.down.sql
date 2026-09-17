-- V0080__audit_tb03_erkennung_event_wrapper.down.sql
--
-- Rueckbau MUSS die Rechte-Lage exakt auf den V0079-Stand zuruecksetzen --
-- nicht auf irgendeine andere Verteilung. Ein Down, das nach dem Rollback
-- eine ANDERE (und sei es "sicherere") Rechte-Lage hinterlaesst als vor
-- V0080, waere derselbe Fehler in umgekehrter Richtung: eine Migration, die
-- niemand mehr Zeile fuer Zeile gegen die GRANTs nachvollziehen kann.
--
-- Reihenfolge: ERST das alte generische Grant wiederherstellen, DANN die
-- Wrapper-Grants/-Funktionen entfernen -- sonst gaebe es einen
-- Zwischenzustand ohne jedes audit.append_event(...)-Recht fuer die Rolle.

-- Grant-Tausch zurueck: erst das alte, generische Grant exakt wie in V0079
-- (D-GRANT-ERW (b)) wiederherstellen ...
GRANT EXECUTE ON FUNCTION audit.append_event(text, text, text, text, text, uuid,
    jsonb, uuid, uuid, smallint) TO edms_einfluss_erkennung;

-- ... dann die Wrapper-Grants entfernen (informativ -- DROP FUNCTION weiter
-- unten raeumt sie ohnehin ab; explizit fuer die Lesbarkeit dieser Datei).
REVOKE EXECUTE ON FUNCTION audit.append_tb03_einsicht_event(integer, boolean) FROM edms_einfluss_erkennung;
REVOKE EXECUTE ON FUNCTION audit.append_tb03_ueberschreitung_event(uuid, uuid, text, text, date, date, text, boolean)
    FROM edms_einfluss_erkennung;

-- Wrapper-Funktionen entfernen (Ownership/PUBLIC-REVOKE brauchen keinen
-- eigenen Rueckbau -- sie verschwinden mit der Funktion).
DROP FUNCTION IF EXISTS audit.append_tb03_einsicht_event(integer, boolean);
DROP FUNCTION IF EXISTS audit.append_tb03_ueberschreitung_event(uuid, uuid, text, text, date, date, text, boolean);
