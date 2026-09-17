-- =====================================================================
-- V0074 (down) -- die drei Nachweis-Felder entfernen
-- =====================================================================
--
-- Die Spalten werden mit ihren Werten entfernt. Fuer `richtung` heisst das:
-- Eine je Kanal bestaetigte Bezug/Einspeisung-Angabe geht verloren und
-- muesste nach einem erneuten Up wieder erfasst werden -- der Default
-- `bezug` behauptet sie danach wieder fuer alle Kanaele. Vor einem Rollback
-- auf einem Bestand mit gepflegten Richtungen ist das zu bedenken.
--
-- `endkundengruppe` und `standort_id` sind reine Zusatzangaben; ihr Verlust
-- macht keine bestehende Zeile ungueltig.

DROP INDEX IF EXISTS energy.ix_system_standort;

ALTER TABLE energy.system
    DROP CONSTRAINT IF EXISTS fk_system_standort_mandant;

ALTER TABLE energy.system
    DROP COLUMN IF EXISTS standort_id;

ALTER TABLE energy.endkunde
    DROP CONSTRAINT IF EXISTS ck_endkunde_endkundengruppe_nicht_leer;

ALTER TABLE energy.endkunde
    DROP COLUMN IF EXISTS endkundengruppe;

ALTER TABLE energy.messkanal
    DROP CONSTRAINT IF EXISTS ck_messkanal_richtung;

ALTER TABLE energy.messkanal
    DROP COLUMN IF EXISTS richtung;
