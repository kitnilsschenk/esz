-- V0069__identity_widerspruch_beleg.down.sql
--
-- Rueckbau der Widerspruchs-Belege.
--
-- Ein vorhandener Beleg ist der Nachweis nach DS-03, dass eine betroffene
-- Person digital widersprochen hat -- mit Zeitpunkt und IP. Ihn zu entfernen
-- hiesse, den Nachweis zu vernichten und den Widerspruch damit zu einer
-- unbelegten Behauptung zu machen.
--
-- Deshalb: laut, nicht still. Dieselbe Linie wie V0063/V0064/V0066-Down.

DO $$
DECLARE
    v_belege bigint;
BEGIN
    SELECT count(*) INTO v_belege FROM identity.widerspruch_beleg;

    IF v_belege > 0 THEN
        RAISE EXCEPTION 'identity: % Widerspruchs-Beleg(e) vorhanden -- der Rueckbau wuerde den DS-03-Nachweis vernichten. Migration abgebrochen; bewusster Rueckbau erfordert Klaerung mit compliance-director.', v_belege;
    END IF;
END
$$;

DROP TABLE IF EXISTS identity.widerspruch_beleg;
