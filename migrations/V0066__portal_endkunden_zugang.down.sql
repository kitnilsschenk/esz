-- V0066__portal_endkunden_zugang.down.sql
--
-- Rueckbau des Portal-Fundaments.
--
-- Der Rueckbau ist NUR zulaessig, solange noch kein Zugang eingeloest wurde.
-- Ein eingeloester Zugang bedeutet: Ein Endkunde hat sich angemeldet, und die
-- Sitzungszeilen belegen das. Diese Zeilen zu entfernen hiesse, einen
-- stattgefundenen Zugriff auf Verbrauchsdaten unbelegbar zu machen -- das ist
-- kein Rueckbau, sondern die Beseitigung eines Nachweises.
--
-- Dieselbe Linie wie V0063/V0064-Down: laut, nicht still.

DO $$
DECLARE
    v_eingeloest bigint;
    v_sitzungen  bigint;
BEGIN
    SELECT count(*) INTO v_eingeloest FROM portal.zugang WHERE passwort_hash IS NOT NULL;
    SELECT count(*) INTO v_sitzungen  FROM portal.sitzung;

    IF v_eingeloest > 0 OR v_sitzungen > 0 THEN
        RAISE EXCEPTION 'portal: % eingeloeste(r) Zugang/Zugaenge und % Sitzung(en) vorhanden -- der Rueckbau wuerde den Beleg entfernen, dass Endkunden auf ihre Daten zugegriffen haben. Migration abgebrochen; bewusster Rueckbau erfordert Klaerung mit compliance-director.', v_eingeloest, v_sitzungen;
    END IF;
END
$$;

DROP TABLE IF EXISTS portal.sitzung;
DROP TABLE IF EXISTS portal.zugang;
DROP SCHEMA IF EXISTS portal;
