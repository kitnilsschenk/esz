-- V0036__audit_einschraenkung_aufhebung_events.down.sql
--
-- Rueckbau der vier neuen Event-Typen. Muster exakt wie V0009-Down Teil (B)
-- und V0033-Down: `audit.event.event_typ` traegt einen Fremdschluessel auf
-- `audit.event_typ(code)`. Existiert bereits ein Ereignis unter einem Code,
-- ist ein Hard-Delete weder erlaubt (FK) noch zulaessig (append-only) -- dann
-- wird die Katalog-Version nur SCD2-konform geschlossen und deaktiviert, der
-- Header bleibt als FK-Ziel bestehen.

DO $$
DECLARE
    v_code       text;
    v_codes      text[] := ARRAY[
        'endkunde.stammdaten.einschraenkung_unterrichtet',
        'endkunde.stammdaten.entsperrt',
        'anschlussnutzer.stammdaten.einschraenkung_unterrichtet',
        'anschlussnutzer.stammdaten.entsperrt'
    ];
    v_referenced boolean;
BEGIN
    FOREACH v_code IN ARRAY v_codes LOOP
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
