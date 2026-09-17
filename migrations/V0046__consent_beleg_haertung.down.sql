-- Down zu V0046 (A12-27/A12-28/A12-29).
--
-- ACHTUNG: Dieser Rueckbau stellt einen Zustand wieder her, gegen den der
-- `compliance-director` am 2026-09-05 ein Teil-Veto ausgesprochen hat. Wer
-- ihn ausfuehrt, nimmt in Kauf, dass Einwilligungs- und Widerrufszeitpunkte
-- wieder den Erfassungs- statt den Erklaerungszeitpunkt ausweisen koennen.
-- Das ist kein technischer Ruecksetzer, sondern die Ruecknahme einer
-- Compliance-Auflage.
--
-- REIHENFOLGE: erst die Widerrufs-Belege entfernen, dann die Unique-Bedingung
-- zuruecksetzen -- sonst schlaegt `ux_einwilligung_beleg_einwilligung` fehl,
-- sobald zu einer Einwilligung Erteilung UND Widerruf belegt sind.
--
-- Der `DELETE` ist hier ausnahmsweise richtig und kein Datenverlust im
-- eigentlichen Sinn: Widerrufs-Belege koennen im Zielzustand gar nicht
-- existieren. Der Widerruf SELBST bleibt unangetastet -- er steht als
-- `widerrufen_at` in `consent.einwilligung` und wird hier nicht beruehrt.
-- Verloren geht die Angabe, auf welchem Weg und unter welcher Fundstelle er
-- erklaert wurde.

DELETE FROM identity.einwilligung_beleg WHERE art = 'widerruf';

ALTER TABLE identity.einwilligung_beleg
    DROP CONSTRAINT ux_einwilligung_beleg_vorgang;

ALTER TABLE identity.einwilligung_beleg
    ADD CONSTRAINT ux_einwilligung_beleg_einwilligung UNIQUE (einwilligung_id);

ALTER TABLE identity.einwilligung_beleg
    DROP CONSTRAINT ck_einwilligung_beleg_quelle_ref_pflicht;

ALTER TABLE identity.einwilligung_beleg
    DROP CONSTRAINT ck_einwilligung_beleg_quelle_ref_form;

ALTER TABLE identity.einwilligung_beleg
    DROP COLUMN quelle_ref;

ALTER TABLE identity.einwilligung_beleg
    DROP CONSTRAINT ck_einwilligung_beleg_art;

ALTER TABLE identity.einwilligung_beleg
    DROP COLUMN art;

ALTER TABLE consent.einwilligung
    DROP CONSTRAINT ck_einwilligung_widerruf_nicht_nach_erfassung;

ALTER TABLE consent.einwilligung
    DROP CONSTRAINT ck_einwilligung_erteilt_nicht_nach_erfassung;
