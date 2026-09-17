-- V0043__audit_herkunft_mapping_events.down.sql
--
-- Rueckbau der beiden Event-Typen. Muster wie V0033-/V0036-/V0038-Down:
-- existiert bereits ein Ereignis unter einem Code, ist ein Hard-Delete weder
-- erlaubt (FK auf `audit.event_typ(code)`) noch zulaessig (append-only) --
-- dann wird die Katalog-Version nur SCD2-konform geschlossen und deaktiviert.
--
-- Die Schleife behandelt beide Codes EINZELN: Es ist der Normalfall, dass
-- Zuordnungen angelegt (protokolliert), aber noch keine entfernt wurden. Ein
-- gemeinsames Alles-oder-nichts wuerde dann entweder einen unbenutzten Code
-- stehen lassen oder einen benutzten anfassen.

DO $$
DECLARE
    v_code       text;
    v_referenced boolean;
BEGIN
    FOREACH v_code IN ARRAY ARRAY[
        'herkunft_mapping.ingest.zugeordnet',
        'herkunft_mapping.ingest.entfernt'
    ]
    LOOP
        SELECT EXISTS (SELECT 1 FROM audit.event WHERE event_typ = v_code) INTO v_referenced;

        IF v_referenced THEN
            UPDATE audit.event_typ_version
               SET aktiv = false,
                   gueltig_bis = now()
             WHERE code = v_code
               AND gueltig_bis IS NULL;
            RAISE WARNING 'audit: Code % wird bereits von audit.event referenziert -- KEIN Hard-Delete (Append-only/FK-Schutz gewahrt). Katalog-Version stattdessen deaktiviert/geschlossen (SCD2); Header-Zeile audit.event_typ bleibt bestehen.', v_code;
        ELSE
            DELETE FROM audit.event_typ_version WHERE code = v_code;
            DELETE FROM audit.event_typ WHERE code = v_code;
        END IF;
    END LOOP;
END
$$;
