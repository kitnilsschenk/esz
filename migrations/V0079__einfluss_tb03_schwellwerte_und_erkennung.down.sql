-- V0079__einfluss_tb03_schwellwerte_und_erkennung.down.sql
--
-- Rollt Schwellwert-Seed, Belegspalte, Idempotenz-Index und Erkennungsrolle
-- zurueck. Reihenfolge umgekehrt zur Up-Datei.
--
-- ACHTUNG -- DATENVERLUST, anders als bei V0022:
-- `DROP COLUMN schwellwert_code` entfernt bei bereits gelaufener Erkennung
-- die FASSUNGSZUORDNUNG saemtlicher Befunde (A13). Die Befundzeilen selbst
-- bleiben, aber es waere danach nicht mehr feststellbar, gegen welche
-- Schwellwertfassung sie entstanden sind -- genau der Zustand, den A11/A12
-- verhindern sollen. Auf einer Umgebung mit Befunden im Bestand ist dieser
-- Rollback deshalb NICHT schadlos: vorher `einfluss.befund` sichern und
-- compliance-director konsultieren.
--
-- Dass die Befunde einen Rollback ueberhaupt ueberleben, ist beabsichtigt:
-- `einfluss.befund` ist ein Erkennungs-Log ohne UPDATE/DELETE (V0020:251),
-- und ein Schema-Rollback ist kein Grund, Nachweisartefakte zu vernichten.

-- (5) Rolle -- REVOKE vor DROP ROLE, sonst verweigert PostgreSQL das DROP
-- wegen bestehender Abhaengigkeiten.
REVOKE EXECUTE ON FUNCTION audit.append_event(text, text, text, text, text, uuid,
    jsonb, uuid, uuid, smallint)                        FROM edms_einfluss_erkennung;
REVOKE USAGE  ON SCHEMA audit                           FROM edms_einfluss_erkennung;

REVOKE SELECT ON einfluss.befund    FROM edms_einfluss_erkennung;
REVOKE INSERT ON einfluss.befund    FROM edms_einfluss_erkennung;
REVOKE SELECT ON einfluss.intervall FROM edms_einfluss_erkennung;
REVOKE SELECT ON einfluss.katalog   FROM edms_einfluss_erkennung;
REVOKE USAGE  ON SCHEMA einfluss    FROM edms_einfluss_erkennung;

-- Idempotent: die Rolle ist ein cluster-globales Objekt und kann von einem
-- frueheren Rollback bereits entfernt sein. Eine noch bestehende LOGIN-Rolle,
-- die Mitglied ist (Test-/Betriebs-Scope, ausserhalb der Migration),
-- verhindert das DROP -- dann zuerst jene entfernen.
DROP ROLE IF EXISTS edms_einfluss_erkennung;

-- (4) Idempotenz-Index.
DROP INDEX IF EXISTS einfluss.ux_einfluss_befund_idempotenz;

-- (3) Seed. Setzt die drei Regeln zurueck auf den V0020-Zustand (NULL) --
-- also auf "nicht maschinell ueberwacht" (A25), nicht auf "keine Schwelle".
UPDATE einfluss.katalog
   SET tb03_schwellwert = NULL
 WHERE code IN ('personenanzahl', 'nutzflaeche', 'nutzungszweck');

-- (2) Herkunfts-CHECK.
ALTER TABLE einfluss.katalog DROP CONSTRAINT ck_katalog_tb03_schwellwert_herkunft;

-- (1) Belegspalte -- s. Warnung im Kopf.
ALTER TABLE einfluss.befund DROP COLUMN schwellwert_code;
