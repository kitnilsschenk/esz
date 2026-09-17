-- Down zu V0047 (A12-1 bis A12-4, A12-6).
--
-- ACHTUNG: Dieser Rueckbau gibt die Rechtsgrundlage wieder zur freien Wahl
-- durch den Aufrufer frei — den Zustand, den der `compliance-director` am
-- 2026-09-05 ausdruecklich beanstandet hat („eine Rechtsgrundlage, die ein
-- Sachbearbeiter aus einem Dropdown waehlt, ist von der falschen Stelle
-- gewaehlt"). Es ist die Ruecknahme einer Compliance-Auflage, kein
-- technischer Ruecksetzer.
--
-- REIHENFOLGE: erst die Constraints an `consent.einwilligung`, dann die
-- Matrix — solange der Fremdschluessel steht, laesst sich die Zieltabelle
-- nicht entfernen.
--
-- `verweigerbar` kehrt an `consent.zweck` zurueck. Der Default `true` ist
-- eine ANNAHME: Die subjektartabhaengige Wahrheit geht beim Rueckbau
-- verloren, und `true` ist die Seite, die niemandem eine Verweigerung
-- abspricht, die ihm zusteht. Fuer `messdaten_verarbeitung` ist sie beim
-- Endkunden trotzdem falsch — genau deshalb wurde die Spalte verschoben.

ALTER TABLE consent.einwilligung
    DROP CONSTRAINT ck_einwilligung_kein_widerruf_bei_vertrag;

ALTER TABLE consent.einwilligung
    DROP CONSTRAINT fk_einwilligung_rechtsgrundlage_matrix;

DROP TABLE consent.zweck_subjekt;

ALTER TABLE consent.zweck ADD COLUMN verweigerbar boolean NOT NULL DEFAULT true;

-- Der bekannte Sonderfall, soweit er ohne Subjektart ueberhaupt abbildbar
-- ist: Die Kernverarbeitung ist fuer den Endkunden nicht verweigerbar.
UPDATE consent.zweck SET verweigerbar = false WHERE code = 'messdaten_verarbeitung';

ALTER TABLE consent.zweck ALTER COLUMN verweigerbar DROP DEFAULT;
