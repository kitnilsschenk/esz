-- Down zu V0086 (Auflage C-9).
--
-- Setzt die SCD2-Fortschreibung der beiden Nutzungsverhaeltnis-Ereignisse
-- zurueck: die von V0086 eingefuegte Version entfernen und die Vorgaenger-
-- Version wieder oeffnen.
--
-- MIT EINER AUSNAHME, und die ist der Punkt: Wurde unter der NEUEN Version
-- bereits ein Ereignis versiegelt, wird sie NICHT hart geloescht. Ein
-- Hard-Delete brauche die Historie, gegen die bestehende `audit.event`-Zeilen
-- geschrieben wurden -- und ein Audit-Log, dessen Katalogstand nachtraeglich
-- verschwindet, ist als Nachweis wertlos. Stattdessen wird die Version
-- SCD2-konform geschlossen und bleibt lesbar; die Vorgaenger-Version wird
-- dann bewusst NICHT wieder geoeffnet, weil das eine zweite offene Range
-- erzeugte (EXCLUDE-Constraint, V0003) und eine Ruecksetzung in diesem Fall
-- ohnehin einen Compliance-Review braucht, keinen SQL-Rueckbau.
--
-- Dasselbe Muster wie V0009.down.sql, dort ausfuehrlich begruendet.

DO $$
DECLARE
    v_code            text;
    v_codes           text[] := ARRAY['nutzungsverhaeltnis.angelegt', 'nutzungsverhaeltnis.beendet'];
    v_new_id          uuid;
    v_new_gueltig_ab  timestamptz;
    v_referenced      boolean;
BEGIN
    FOREACH v_code IN ARRAY v_codes LOOP
        -- Die von V0086 eingefuegte Version ist die einzige mit offenem Ende
        -- (EXCLUDE-Constraint laesst je Code hoechstens eine zu). ORDER BY +
        -- LIMIT 1 als Absicherung, falls seither dennoch mehrere entstanden
        -- sein sollten -- nimmt dann die juengste.
        SELECT id, gueltig_ab INTO v_new_id, v_new_gueltig_ab
          FROM audit.event_typ_version
         WHERE code = v_code AND gueltig_bis IS NULL
         ORDER BY gueltig_ab DESC
         LIMIT 1;

        IF v_new_id IS NULL THEN
            RAISE WARNING 'audit: keine offene Version fuer % gefunden -- V0086 vermutlich bereits zurueckgerollt oder Katalog seither veraendert; ueberspringe.', v_code;
            CONTINUE;
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM audit.event
             WHERE event_typ = v_code AND ts >= v_new_gueltig_ab
        ) INTO v_referenced;

        IF v_referenced THEN
            UPDATE audit.event_typ_version
               SET gueltig_bis = now()
             WHERE id = v_new_id;
            RAISE WARNING 'audit: Version % (id=%) von % wird bereits von audit.event referenziert -- KEIN Hard-Delete, KEINE Restauration der Vorgaenger-Version (Append-only-Schutz). Version geschlossen; Ruecksetzung braucht einen compliance-director-/database-lead-Review, keinen SQL-Rueckbau.', v_new_gueltig_ab, v_new_id, v_code;
        ELSE
            DELETE FROM audit.event_typ_version WHERE id = v_new_id;
            UPDATE audit.event_typ_version
               SET gueltig_bis = NULL
             WHERE code = v_code AND gueltig_bis = v_new_gueltig_ab;
            IF NOT FOUND THEN
                RAISE WARNING 'audit: Vorgaenger-Version fuer % nicht wiedergeoeffnet (keine Zeile mit gueltig_bis = %) -- Katalog seither veraendert; bitte manuell pruefen.', v_code, v_new_gueltig_ab;
            END IF;
        END IF;
    END LOOP;
END
$$;
