-- V0038__audit_art19_mitteilung_event.down.sql
--
-- Rueckbau des Event-Typs. Muster wie V0033-Down/V0036-Down: existiert bereits
-- ein Ereignis unter diesem Code, ist ein Hard-Delete weder erlaubt (FK auf
-- `audit.event_typ(code)`) noch zulaessig (append-only) -- dann wird die
-- Katalog-Version nur SCD2-konform geschlossen und deaktiviert.

DO $$
DECLARE
    v_code       text := 'nachweis.einreichung.art19_mitgeteilt';
    v_referenced boolean;
BEGIN
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
END
$$;
