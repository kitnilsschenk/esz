-- V0068__portal_zugang_kennung.down.sql
--
-- Rueckbau der Anmeldekennung.
--
-- Ohne Kennung ist keine Anmeldung mehr moeglich (der Zugangscode ist nach
-- dem Einloesen verbraucht). Der Rueckbau sperrt damit faktisch jeden
-- eingeloesten Zugang aus — er ist nur sinnvoll, solange es keinen gibt.

DO $$
DECLARE
    v_eingeloest bigint;
BEGIN
    SELECT count(*) INTO v_eingeloest FROM portal.zugang WHERE passwort_hash IS NOT NULL;

    IF v_eingeloest > 0 THEN
        RAISE EXCEPTION 'portal: % eingeloeste(r) Zugang/Zugaenge vorhanden -- ohne Kennung koennten sich diese Endkunden nicht mehr anmelden. Migration abgebrochen.', v_eingeloest;
    END IF;
END
$$;

ALTER TABLE portal.zugang
    DROP CONSTRAINT IF EXISTS ck_portal_zugang_kennung_form,
    DROP CONSTRAINT IF EXISTS ux_portal_zugang_kennung;

ALTER TABLE portal.zugang
    DROP COLUMN IF EXISTS kennung;
