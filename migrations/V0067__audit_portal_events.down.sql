-- V0067__audit_portal_events.down.sql
--
-- Rueckbau der Portal-Ereignisse und des Akteurstyps `endkunde`.
--
-- `audit.event` ist append-only. Existieren bereits Ereigniszeilen mit einem
-- der vier Codes ODER mit `actor_typ='endkunde'`, ist ein Rueckbau nicht
-- moeglich, ohne das Log zu verletzen:
--
--   * Die Katalog-Zeilen zu loeschen wuerde den FK auf `audit.event_typ`
--     brechen (ON DELETE NO ACTION, V0003) — der DELETE scheitert ohnehin.
--   * Den CHECK zurueckzusetzen wuerde an vorhandenen `endkunde`-Zeilen
--     scheitern.
--
-- Deshalb: Bei vorhandenen Ereignissen bricht der Rueckbau mit klarer
-- Meldung ab, statt auf einen FK- oder CHECK-Fehler zu laufen, den niemand
-- deuten kann. Dieselbe Linie wie V0032-Down.

DO $$
DECLARE
    v_ereignisse bigint;
    v_endkunden  bigint;
BEGIN
    SELECT count(*) INTO v_ereignisse FROM audit.event
     WHERE event_typ IN ('portal.zugang.ausgegeben', 'portal.zugang.eingeloest', 'portal.anmeldung', 'portal.abmeldung');
    SELECT count(*) INTO v_endkunden FROM audit.event WHERE actor_typ = 'endkunde';

    IF v_ereignisse > 0 OR v_endkunden > 0 THEN
        RAISE EXCEPTION 'audit: % Portal-Ereignis(se) und % Zeile(n) mit actor_typ=endkunde vorhanden -- audit.event ist append-only, ein Rueckbau waere eine Log-Verletzung. Migration abgebrochen.', v_ereignisse, v_endkunden;
    END IF;
END
$$;

DELETE FROM audit.event_typ_version
 WHERE code IN ('portal.zugang.ausgegeben', 'portal.zugang.eingeloest', 'portal.anmeldung', 'portal.abmeldung');

DELETE FROM audit.event_typ
 WHERE code IN ('portal.zugang.ausgegeben', 'portal.zugang.eingeloest', 'portal.anmeldung', 'portal.abmeldung');

ALTER TABLE audit.event
    DROP CONSTRAINT ck_event_actor_typ;

ALTER TABLE audit.event
    ADD CONSTRAINT ck_event_actor_typ CHECK (
        actor_typ IN ('benutzer', 'dienstkonto', 'system')
    );

COMMENT ON CONSTRAINT ck_event_actor_typ ON audit.event IS NULL;
